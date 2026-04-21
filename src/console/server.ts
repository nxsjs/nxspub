import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { strToU8, zipSync } from 'fflate'
import { createApp, eventHandler, toNodeListener } from 'h3'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { releaseCommand } from '../commands/release'
import { versionCommand } from '../commands/version'
import { NxspubError, toErrorMessage } from '../utils/errors'
import { cliLogger } from '../utils/logger'
import {
  buildPreviewChecksReport,
  buildPreviewResult,
  getDraftHealthSummary,
  getPreviewContext,
  pruneDrafts,
} from './core'
import { renderPreviewWebPage } from './web'
import type {
  DraftPruneRequest,
  PreviewDiagnosticBundle,
  PreviewResult,
  PreviewSseEvent,
  PreviewSnapshotPayload,
  PreviewSnapshotSummary,
} from './types'

/**
 * @en Options for starting preview web server.
 * @zh 启动预览 Web 服务的参数。
 */
export interface ConsoleServerOptions {
  /** @en Workspace root directory. @zh 工作区根目录。 */
  cwd: string
  /** @en Listen host. @zh 监听主机。 */
  host: string
  /** @en Preferred listen port. @zh 首选监听端口。 */
  port: number
  /** @en Whether prune API is disabled. @zh 是否禁用 prune API。 */
  readonlyStrict?: boolean
  /** @en Start API-only mode and disable static web serving. @zh 启动仅 API 模式并禁用静态 Web 托管。 */
  apiOnly?: boolean
  /** @en API request timeout in milliseconds. @zh API 请求超时时间（毫秒）。 */
  requestTimeoutMs?: number
}

/**
 * @en Running server handle.
 * @zh 运行中服务句柄。
 */
export interface ConsoleServerHandle {
  /** @en Final bound URL. @zh 最终绑定访问地址。 */
  url: string
  /** @en Session token required by API requests. @zh API 请求所需会话令牌。 */
  token: string
  /** @en Close server and release resources. @zh 关闭服务并释放资源。 */
  close(): Promise<void>
}

interface ApiSuccess<T> {
  ok: true
  apiVersion: 'v1'
  data: T
  requestId: string
  timestamp: string
}

interface ApiFailure {
  ok: false
  apiVersion: 'v1'
  error: {
    code:
      | 'BAD_REQUEST'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'TIMEOUT'
      | 'INTERNAL'
    message: string
    details?: unknown
  }
  requestId: string
  timestamp: string
}

class PreviewRequestTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PreviewRequestTimeoutError'
  }
}

type ExecutionTaskKind = 'version' | 'release'

interface ExecutionTaskState {
  kind: ExecutionTaskKind
  startedAt: string
  requestId: string
}

interface ExecutionLogItem {
  level: 'info' | 'warn' | 'error'
  message: string
  at: string
}

interface ExecutionGuardResult {
  checks: Awaited<ReturnType<typeof buildPreviewChecksReport>>
}

function createRequestId(seed: string): string {
  return createHash('sha1').update(seed).digest('hex').slice(0, 12)
}

async function withRequestTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new PreviewRequestTimeoutError(timeoutMessage))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

function writeJson<T>(
  response: ServerResponse,
  statusCode: number,
  payload: ApiSuccess<T> | ApiFailure,
) {
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

function writeError(
  response: ServerResponse,
  statusCode: number,
  code: ApiFailure['error']['code'],
  message: string,
  details?: unknown,
) {
  const timestamp = new Date().toISOString()
  const requestId = createRequestId(
    `${timestamp}:${statusCode}:${code}:${Math.random()}`,
  )
  writeJson(response, statusCode, {
    ok: false,
    apiVersion: 'v1',
    error: { code, message, details },
    requestId,
    timestamp,
  })
}

function writeSuccess<T>(response: ServerResponse, data: T) {
  const timestamp = new Date().toISOString()
  const requestId = createRequestId(`${timestamp}:${Math.random()}`)
  writeJson(response, 200, {
    ok: true,
    apiVersion: 'v1',
    data,
    requestId,
    timestamp,
  })
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return {} as T
  return JSON.parse(raw) as T
}

function requireAuth(
  request: IncomingMessage,
  response: ServerResponse,
  sessionToken: string,
): boolean {
  const token = request.headers['x-nxspub-console-token']
  if (token === sessionToken) return true
  writeError(response, 401, 'UNAUTHORIZED', 'Invalid or missing session token.')
  return false
}

function requireWritableMode(
  response: ServerResponse,
  readonlyStrict: boolean | undefined,
  endpointName: string,
): boolean {
  if (!readonlyStrict) return true
  writeError(
    response,
    403,
    'FORBIDDEN',
    `${endpointName} is disabled in readonly-strict mode.`,
  )
  return false
}

async function evaluateExecutionGuards(
  cwd: string,
  branch: string,
  requestTimeoutMs: number,
): Promise<ExecutionGuardResult> {
  const preview = await withRequestTimeout(
    buildPreviewResult({
      cwd,
      branch,
      includeChangelog: false,
      includeChecks: false,
    }),
    requestTimeoutMs,
    'Request timed out while computing execution preview context.',
  )

  const checks = await withRequestTimeout(
    buildPreviewChecksReport(cwd, preview),
    requestTimeoutMs,
    'Request timed out while computing execution checks.',
  )

  return { checks }
}

async function tryServeLogo(
  pathname: string,
  cwd: string,
  response: ServerResponse,
): Promise<boolean> {
  if (pathname !== '/logo.svg') return false
  const logoPath = path.join(cwd, 'logo.svg')
  try {
    const content = await fs.readFile(logoPath)
    response.statusCode = 200
    response.setHeader('content-type', 'image/svg+xml; charset=utf-8')
    response.end(content)
  } catch {
    writeError(
      response,
      404,
      'NOT_FOUND',
      'logo.svg not found in workspace root.',
    )
  }
  return true
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

async function resolveWebStaticRoot(): Promise<string | null> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(moduleDir, '../../dist/console-web'),
    path.resolve(moduleDir, '../console-web'),
    path.resolve(moduleDir, './console-web'),
    path.resolve(process.cwd(), 'dist/console-web'),
  ]

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isDirectory()) return candidate
    } catch {
      // continue
    }
  }
  return null
}

async function tryServeWebStatic(
  pathname: string,
  response: ServerResponse,
  staticRoot: string | null,
  sessionToken: string,
): Promise<boolean> {
  if (!staticRoot) return false

  const isAssetRequest = path.extname(pathname).length > 0
  const indexPath = path.join(staticRoot, 'index.html')
  const resolvedPath = path.resolve(
    staticRoot,
    pathname === '/' ? 'index.html' : `.${pathname}`,
  )

  if (!resolvedPath.startsWith(staticRoot)) {
    writeError(response, 403, 'FORBIDDEN', 'Invalid static resource path.')
    return true
  }

  try {
    const filePath =
      pathname === '/' || !isAssetRequest ? indexPath : resolvedPath
    let fileContent = await fs.readFile(filePath)

    if (path.basename(filePath) === 'index.html') {
      const html = fileContent
        .toString('utf-8')
        .replace(/__NXSPUB_CONSOLE_TOKEN__/g, sessionToken)
      response.statusCode = 200
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.setHeader('cache-control', 'no-cache')
      response.end(html)
      return true
    }

    response.statusCode = 200
    response.setHeader('content-type', getMimeType(filePath))
    response.setHeader('cache-control', 'public, max-age=31536000, immutable')
    response.end(fileContent)
    return true
  } catch {
    if (!isAssetRequest) {
      try {
        const html = await fs.readFile(indexPath, 'utf-8')
        response.statusCode = 200
        response.setHeader('content-type', 'text/html; charset=utf-8')
        response.setHeader('cache-control', 'no-cache')
        response.end(html.replace(/__NXSPUB_CONSOLE_TOKEN__/g, sessionToken))
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

async function buildDiagnosticBundle(
  cwd: string,
  preview: PreviewResult | null,
  timeoutMs: number,
): Promise<PreviewDiagnosticBundle> {
  const context = await withRequestTimeout(
    getPreviewContext(cwd),
    timeoutMs,
    'Request timed out while building diagnostic context.',
  )
  const resolvedPreview =
    preview ||
    (await withRequestTimeout(
      buildPreviewResult({
        cwd,
        includeChangelog: true,
      }),
      timeoutMs,
      'Request timed out while building diagnostic preview.',
    ))
  const checks = await withRequestTimeout(
    buildPreviewChecksReport(cwd, resolvedPreview),
    timeoutMs,
    'Request timed out while building diagnostic checks.',
  )
  const drafts = await withRequestTimeout(
    getDraftHealthSummary(cwd, resolvedPreview.targetVersion?.split('-')[0]),
    timeoutMs,
    'Request timed out while building diagnostic drafts report.',
  )

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      apiVersion: 'v1',
      nodeVersion: process.version,
      cwd,
    },
    context,
    preview: resolvedPreview,
    checks,
    drafts,
  }
}

function getSnapshotDir(cwd: string): string {
  return path.join(cwd, '.nxspub', 'console-snapshots')
}

function normalizeSnapshotId(input: string): string {
  return input.trim().replace(/[^a-zA-Z0-9._-]+/g, '-')
}

async function listSnapshots(cwd: string): Promise<PreviewSnapshotSummary[]> {
  const root = getSnapshotDir(cwd)
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    const snapshots: PreviewSnapshotSummary[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const filePath = path.join(root, entry.name)
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const parsed = JSON.parse(content) as Partial<PreviewSnapshotPayload>
        if (
          typeof parsed.id === 'string' &&
          typeof parsed.createdAt === 'string' &&
          typeof parsed.baseBranch === 'string'
        ) {
          snapshots.push({
            id: parsed.id,
            createdAt: parsed.createdAt,
            baseBranch: parsed.baseBranch,
            compareBranch: parsed.compareBranch,
          })
        }
      } catch {
        // ignore malformed file
      }
    }
    return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

async function readSnapshot(
  cwd: string,
  snapshotId: string,
): Promise<PreviewSnapshotPayload | null> {
  const normalizedId = normalizeSnapshotId(snapshotId)
  if (!normalizedId) return null

  const filePath = path.join(getSnapshotDir(cwd), `${normalizedId}.json`)
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as PreviewSnapshotPayload
  } catch {
    return null
  }
}

async function deleteSnapshot(
  cwd: string,
  snapshotId: string,
): Promise<boolean> {
  const normalizedId = normalizeSnapshotId(snapshotId)
  if (!normalizedId) return false
  const filePath = path.join(getSnapshotDir(cwd), `${normalizedId}.json`)
  try {
    await fs.unlink(filePath)
    return true
  } catch {
    return false
  }
}

async function writeSnapshot(
  cwd: string,
  payload: PreviewSnapshotPayload,
): Promise<void> {
  const dir = getSnapshotDir(cwd)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${payload.id}.json`)
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8')
}

/**
 * @en Start preview web server with API and static page.
 * @zh 启动包含 API 与静态页面的预览 Web 服务。
 *
 * @param options
 * @en Server startup options.
 * @zh 服务启动参数。
 *
 * @returns
 * @en Running server handle.
 * @zh 运行中的服务句柄。
 */
export async function startConsoleWebServer(
  options: ConsoleServerOptions,
): Promise<ConsoleServerHandle> {
  const { cwd, readonlyStrict, apiOnly, requestTimeoutMs = 20000 } = options
  const sessionToken = randomBytes(18).toString('hex')
  const staticRoot = apiOnly ? null : await resolveWebStaticRoot()
  let lastPreviewResult: PreviewResult | null = null
  let previewInFlight = false
  let executionInFlight: ExecutionTaskState | null = null
  let lastSuccessfulVersionExecution: {
    branch: string
    dry: boolean
    executedAt: string
  } | null = null
  const eventClients = new Set<ServerResponse>()

  const emitEvent = (event: PreviewSseEvent) => {
    const serialized = `event: status\ndata: ${JSON.stringify(event)}\n\n`
    for (const client of eventClients) {
      try {
        client.write(serialized)
      } catch {
        eventClients.delete(client)
      }
    }
  }

  const requestHandler = async (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    try {
      const requestUrl = new URL(
        request.url || '/',
        `http://${request.headers.host || '127.0.0.1'}`,
      )
      const pathname = requestUrl.pathname
      const method = (request.method || 'GET').toUpperCase()

      if (await tryServeLogo(pathname, cwd, response)) return

      if (pathname === '/api/events' && method === 'GET') {
        const token =
          requestUrl.searchParams.get('token') ||
          (request.headers['x-nxspub-console-token'] as string | undefined)
        if (token !== sessionToken) {
          writeError(
            response,
            401,
            'UNAUTHORIZED',
            'Invalid or missing session token.',
          )
          return
        }

        response.statusCode = 200
        response.setHeader('content-type', 'text/event-stream; charset=utf-8')
        response.setHeader('cache-control', 'no-cache')
        response.setHeader('connection', 'keep-alive')
        response.write(
          `event: status\ndata: ${JSON.stringify({
            kind: 'server',
            phase: 'info',
            message: 'SSE stream connected.',
            timestamp: new Date().toISOString(),
          } satisfies PreviewSseEvent)}\n\n`,
        )
        eventClients.add(response)
        request.on('close', () => {
          eventClients.delete(response)
        })
        return
      }

      if (pathname === '/' && method === 'GET') {
        if (apiOnly) {
          writeError(
            response,
            404,
            'NOT_FOUND',
            'Web UI is disabled in api-only mode.',
          )
          return
        }
        const servedStatic = await tryServeWebStatic(
          pathname,
          response,
          staticRoot,
          sessionToken,
        )
        if (servedStatic) return

        response.statusCode = 200
        response.setHeader('content-type', 'text/html; charset=utf-8')
        response.end(renderPreviewWebPage(sessionToken))
        return
      }

      if (!pathname.startsWith('/api/')) {
        const servedStatic = await tryServeWebStatic(
          pathname,
          response,
          staticRoot,
          sessionToken,
        )
        if (servedStatic) return
        writeError(response, 404, 'NOT_FOUND', 'Route not found.')
        return
      }

      if (!requireAuth(request, response, sessionToken)) return

      if (pathname === '/api/health' && method === 'GET') {
        writeSuccess(response, { status: 'ok', version: 'v1' })
        return
      }

      if (pathname === '/api/context' && method === 'GET') {
        emitEvent({
          kind: 'context',
          phase: 'start',
          message: 'Loading preview context.',
          timestamp: new Date().toISOString(),
        })
        const context = await withRequestTimeout(
          getPreviewContext(cwd),
          requestTimeoutMs,
          'Request timed out while loading preview context.',
        )
        writeSuccess(response, context)
        emitEvent({
          kind: 'context',
          phase: 'success',
          message: 'Preview context loaded.',
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (pathname === '/api/preview' && method === 'POST') {
        if (previewInFlight) {
          writeError(
            response,
            409,
            'CONFLICT',
            'A preview request is already running.',
          )
          return
        }
        previewInFlight = true
        emitEvent({
          kind: 'preview',
          phase: 'start',
          message: 'Computing preview result.',
          timestamp: new Date().toISOString(),
        })
        try {
          const body = await readJsonBody<{
            branch?: string
            includeChangelog?: boolean
            includeChecks?: boolean
          }>(request)
          const preview = await withRequestTimeout(
            buildPreviewResult({
              cwd,
              branch: body.branch,
              includeChangelog: body.includeChangelog,
              includeChecks: body.includeChecks,
            }),
            requestTimeoutMs,
            'Request timed out while computing preview.',
          )
          if (body.includeChecks) {
            const checksReport = await withRequestTimeout(
              buildPreviewChecksReport(cwd, preview),
              requestTimeoutMs,
              'Request timed out while computing checks.',
            )
            preview.checks = checksReport.items
          }
          lastPreviewResult = preview
          writeSuccess(response, preview)
          emitEvent({
            kind: 'preview',
            phase: 'success',
            message: 'Preview result computed.',
            timestamp: new Date().toISOString(),
          })
        } finally {
          previewInFlight = false
        }
        return
      }

      if (pathname === '/api/checks' && method === 'POST') {
        emitEvent({
          kind: 'checks',
          phase: 'start',
          message: 'Computing pre-release checks.',
          timestamp: new Date().toISOString(),
        })
        const body = await readJsonBody<{ branch?: string }>(request)
        const preview = await withRequestTimeout(
          buildPreviewResult({
            cwd,
            branch: body.branch,
            includeChangelog: false,
            includeChecks: false,
          }),
          requestTimeoutMs,
          'Request timed out while computing preview checks context.',
        )
        const checks = await withRequestTimeout(
          buildPreviewChecksReport(cwd, preview),
          requestTimeoutMs,
          'Request timed out while computing checks.',
        )
        writeSuccess(response, checks)
        emitEvent({
          kind: 'checks',
          phase: 'success',
          message: 'Pre-release checks computed.',
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (pathname === '/api/drafts' && method === 'GET') {
        emitEvent({
          kind: 'drafts',
          phase: 'start',
          message: 'Analyzing draft health.',
          timestamp: new Date().toISOString(),
        })
        const target = requestUrl.searchParams.get('target') || undefined
        const draftHealth = await withRequestTimeout(
          getDraftHealthSummary(cwd, target),
          requestTimeoutMs,
          'Request timed out while analyzing draft health.',
        )
        writeSuccess(response, draftHealth)
        emitEvent({
          kind: 'drafts',
          phase: 'success',
          message: 'Draft health analysis completed.',
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (pathname === '/api/drafts/prune' && method === 'POST') {
        if (!requireWritableMode(response, readonlyStrict, 'Draft prune')) {
          return
        }
        const body = await readJsonBody<DraftPruneRequest>(request)
        if (
          !body?.target ||
          !/^\d+\.\d+\.\d+$/.test(body.target) ||
          body.only !== 'behind'
        ) {
          writeError(
            response,
            400,
            'BAD_REQUEST',
            'Invalid payload. Expected { target: "x.y.z", only: "behind" }.',
          )
          return
        }
        const result = await withRequestTimeout(
          pruneDrafts(cwd, body),
          requestTimeoutMs,
          'Request timed out while pruning drafts.',
        )
        writeSuccess(response, result)
        emitEvent({
          kind: 'drafts-prune',
          phase: 'success',
          message: `Draft prune completed. pruned=${result.prunedCount}`,
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (pathname === '/api/execution/status' && method === 'GET') {
        writeSuccess(response, {
          running: executionInFlight !== null,
          currentTask: executionInFlight || undefined,
        })
        return
      }

      if (pathname === '/api/version/run' && method === 'POST') {
        if (!requireWritableMode(response, readonlyStrict, 'Version run')) {
          return
        }
        if (executionInFlight) {
          writeError(
            response,
            409,
            'CONFLICT',
            `Another execution task is running: ${executionInFlight.kind}.`,
          )
          return
        }

        const body = await readJsonBody<{
          dry?: boolean
          branch?: string
        }>(request)
        const dry = body.dry !== false
        const context = await withRequestTimeout(
          getPreviewContext(cwd),
          requestTimeoutMs,
          'Request timed out while loading execution context.',
        )

        if (body.branch && body.branch !== context.currentBranch) {
          writeError(
            response,
            409,
            'CONFLICT',
            `Execution branch mismatch: current="${context.currentBranch}", requested="${body.branch}".`,
          )
          return
        }
        const guardResult = await evaluateExecutionGuards(
          cwd,
          context.currentBranch,
          requestTimeoutMs,
        )
        if (!guardResult.checks.policy.ok) {
          writeError(
            response,
            409,
            'CONFLICT',
            guardResult.checks.policy.message ||
              'Branch policy check failed for version execution.',
          )
          return
        }
        if (!guardResult.checks.gitSync.ok) {
          writeError(
            response,
            409,
            'CONFLICT',
            `Git sync check failed: dirty=${guardResult.checks.gitSync.dirty}, ahead=${guardResult.checks.gitSync.ahead}, behind=${guardResult.checks.gitSync.behind}.`,
          )
          return
        }

        const executionRequestId = createRequestId(
          `${Date.now()}:version:${Math.random()}`,
        )
        executionInFlight = {
          kind: 'version',
          startedAt: new Date().toISOString(),
          requestId: executionRequestId,
        }
        emitEvent({
          kind: 'execution',
          phase: 'start',
          message: `Running version (${dry ? 'dry-run' : 'apply'}).`,
          timestamp: new Date().toISOString(),
        })

        try {
          await versionCommand({ cwd, dry })
          const nextPreview = await withRequestTimeout(
            buildPreviewResult({
              cwd,
              branch: context.currentBranch,
              includeChangelog: false,
              includeChecks: false,
            }),
            requestTimeoutMs,
            'Request timed out while refreshing execution summary.',
          )
          lastPreviewResult = nextPreview
          writeSuccess(response, {
            status: 'success' as const,
            dry,
            summary: {
              mode: nextPreview.mode,
              targetVersion: nextPreview.targetVersion,
              releasePackageCount: nextPreview.releasePackageCount,
            },
            logs: [
              {
                level: 'info',
                message: dry
                  ? 'Version dry-run finished successfully.'
                  : 'Version execution finished successfully.',
                at: new Date().toISOString(),
              } satisfies ExecutionLogItem,
            ],
          })
          emitEvent({
            kind: 'execution',
            phase: 'success',
            message: `Version ${dry ? 'dry-run' : 'apply'} completed.`,
            timestamp: new Date().toISOString(),
          })
          lastSuccessfulVersionExecution = {
            branch: context.currentBranch,
            dry,
            executedAt: new Date().toISOString(),
          }
        } catch (error) {
          const message = toErrorMessage(error) || 'Version execution failed.'
          writeSuccess(response, {
            status: 'failed' as const,
            dry,
            summary: {
              mode: context.mode,
              releasePackageCount: 0,
            },
            logs: [
              {
                level: 'error',
                message,
                at: new Date().toISOString(),
              } satisfies ExecutionLogItem,
            ],
          })
          emitEvent({
            kind: 'execution',
            phase: 'error',
            message,
            timestamp: new Date().toISOString(),
          })
        } finally {
          executionInFlight = null
        }
        return
      }

      if (pathname === '/api/release/run' && method === 'POST') {
        if (!requireWritableMode(response, readonlyStrict, 'Release run')) {
          return
        }
        if (executionInFlight) {
          writeError(
            response,
            409,
            'CONFLICT',
            `Another execution task is running: ${executionInFlight.kind}.`,
          )
          return
        }

        const body = await readJsonBody<{
          dry?: boolean
          branch?: string
          registry?: string
          tag?: string
          access?: string
          provenance?: boolean
          skipBuild?: boolean
          skipSync?: boolean
        }>(request)
        const dry = body.dry !== false
        const context = await withRequestTimeout(
          getPreviewContext(cwd),
          requestTimeoutMs,
          'Request timed out while loading execution context.',
        )

        if (body.branch && body.branch !== context.currentBranch) {
          writeError(
            response,
            409,
            'CONFLICT',
            `Execution branch mismatch: current="${context.currentBranch}", requested="${body.branch}".`,
          )
          return
        }
        const guardResult = await evaluateExecutionGuards(
          cwd,
          context.currentBranch,
          requestTimeoutMs,
        )
        if (!guardResult.checks.policy.ok) {
          writeError(
            response,
            409,
            'CONFLICT',
            guardResult.checks.policy.message ||
              'Branch policy check failed for release execution.',
          )
          return
        }
        if (!guardResult.checks.gitSync.ok) {
          writeError(
            response,
            409,
            'CONFLICT',
            `Git sync check failed: dirty=${guardResult.checks.gitSync.dirty}, ahead=${guardResult.checks.gitSync.ahead}, behind=${guardResult.checks.gitSync.behind}.`,
          )
          return
        }
        if (
          !lastSuccessfulVersionExecution ||
          lastSuccessfulVersionExecution.branch !== context.currentBranch
        ) {
          writeError(
            response,
            409,
            'CONFLICT',
            `Release execution requires a successful version run in this session on branch "${context.currentBranch}".`,
          )
          return
        }
        if (!dry && lastSuccessfulVersionExecution.dry) {
          writeError(
            response,
            409,
            'CONFLICT',
            'Release publish requires a prior non-dry version run in this session.',
          )
          return
        }

        const executionRequestId = createRequestId(
          `${Date.now()}:release:${Math.random()}`,
        )
        executionInFlight = {
          kind: 'release',
          startedAt: new Date().toISOString(),
          requestId: executionRequestId,
        }
        emitEvent({
          kind: 'execution',
          phase: 'start',
          message: `Running release (${dry ? 'dry-run' : 'publish'}).`,
          timestamp: new Date().toISOString(),
        })

        try {
          const releaseResult = await releaseCommand({
            cwd,
            dry,
            branch: body.branch,
            registry: body.registry,
            tag: body.tag,
            access: body.access,
            provenance: body.provenance,
            skipBuild: body.skipBuild,
            skipSync: body.skipSync,
          })
          writeSuccess(response, {
            status: 'success' as const,
            dry,
            published: releaseResult.published,
            skipped: releaseResult.skipped,
            logs: [
              {
                level: 'info',
                message: dry
                  ? 'Release dry-run finished successfully.'
                  : 'Release publish finished successfully.',
                at: new Date().toISOString(),
              } satisfies ExecutionLogItem,
            ],
          })
          emitEvent({
            kind: 'execution',
            phase: 'success',
            message: `Release ${dry ? 'dry-run' : 'publish'} completed.`,
            timestamp: new Date().toISOString(),
          })
        } catch (error) {
          const message = toErrorMessage(error) || 'Release execution failed.'
          writeSuccess(response, {
            status: 'failed' as const,
            dry,
            published: [] as Array<{ name: string; version: string }>,
            skipped: [] as Array<{
              name: string
              version: string
              reason: string
            }>,
            logs: [
              {
                level: 'error',
                message,
                at: new Date().toISOString(),
              } satisfies ExecutionLogItem,
            ],
          })
          emitEvent({
            kind: 'execution',
            phase: 'error',
            message,
            timestamp: new Date().toISOString(),
          })
        } finally {
          executionInFlight = null
        }
        return
      }

      if (pathname === '/api/export.json' && method === 'GET') {
        if (!lastPreviewResult) {
          writeError(
            response,
            404,
            'NOT_FOUND',
            'No preview has been computed in this session.',
          )
          return
        }
        writeSuccess(response, lastPreviewResult)
        return
      }

      if (pathname === '/api/export.bundle' && method === 'GET') {
        emitEvent({
          kind: 'export-bundle',
          phase: 'start',
          message: 'Building diagnostic bundle.',
          timestamp: new Date().toISOString(),
        })
        const format = (requestUrl.searchParams.get('format') || 'json')
          .toLowerCase()
          .trim()
        if (!['json', 'zip'].includes(format)) {
          writeError(
            response,
            400,
            'BAD_REQUEST',
            'Invalid format. Use format=json or format=zip.',
          )
          return
        }

        const bundle = await buildDiagnosticBundle(
          cwd,
          lastPreviewResult,
          requestTimeoutMs,
        )

        if (format === 'json') {
          writeSuccess(response, bundle)
          emitEvent({
            kind: 'export-bundle',
            phase: 'success',
            message: 'Diagnostic bundle JSON generated.',
            timestamp: new Date().toISOString(),
          })
          return
        }

        const bundleTimestamp = bundle.meta.generatedAt.replace(/[:.]/g, '-')
        const zipPayload = zipSync({
          'bundle.json': strToU8(JSON.stringify(bundle, null, 2)),
          'context.json': strToU8(JSON.stringify(bundle.context, null, 2)),
          'preview.json': strToU8(JSON.stringify(bundle.preview, null, 2)),
          'checks.json': strToU8(JSON.stringify(bundle.checks, null, 2)),
          'drafts.json': strToU8(JSON.stringify(bundle.drafts, null, 2)),
        })

        response.statusCode = 200
        response.setHeader('content-type', 'application/zip')
        response.setHeader(
          'content-disposition',
          `attachment; filename="nxspub-diagnostic-${bundleTimestamp}.zip"`,
        )
        response.end(Buffer.from(zipPayload))
        emitEvent({
          kind: 'export-bundle',
          phase: 'success',
          message: 'Diagnostic bundle ZIP generated.',
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (pathname === '/api/snapshots' && method === 'GET') {
        const snapshots = await withRequestTimeout(
          listSnapshots(cwd),
          requestTimeoutMs,
          'Request timed out while listing snapshots.',
        )
        writeSuccess(response, { snapshots })
        emitEvent({
          kind: 'snapshots',
          phase: 'success',
          message: `Loaded ${snapshots.length} snapshots.`,
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (pathname === '/api/snapshots' && method === 'POST') {
        if (!requireWritableMode(response, readonlyStrict, 'Snapshot save')) {
          return
        }
        const body = await readJsonBody<{
          id?: string
          baseBranch?: string
          compareBranch?: string
          basePreview?: PreviewResult
          comparePreview?: PreviewResult
        }>(request)

        if (!body.basePreview || !body.comparePreview) {
          writeError(
            response,
            400,
            'BAD_REQUEST',
            'Invalid payload. Expected basePreview and comparePreview.',
          )
          return
        }

        const generatedId =
          normalizeSnapshotId(body.id || '') ||
          `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}`
        const payload: PreviewSnapshotPayload = {
          id: generatedId,
          createdAt: new Date().toISOString(),
          baseBranch: body.baseBranch || body.basePreview.branch || 'unknown',
          compareBranch:
            body.compareBranch || body.comparePreview.branch || undefined,
          basePreview: body.basePreview,
          comparePreview: body.comparePreview,
        }

        await withRequestTimeout(
          writeSnapshot(cwd, payload),
          requestTimeoutMs,
          'Request timed out while saving snapshot.',
        )
        writeSuccess(response, {
          id: payload.id,
          createdAt: payload.createdAt,
        })
        emitEvent({
          kind: 'snapshots',
          phase: 'success',
          message: `Snapshot saved: ${payload.id}`,
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (pathname.startsWith('/api/snapshots/') && method === 'GET') {
        const snapshotId = decodeURIComponent(
          pathname.replace('/api/snapshots/', ''),
        )
        if (!snapshotId) {
          writeError(response, 400, 'BAD_REQUEST', 'Snapshot id is required.')
          return
        }
        const snapshot = await withRequestTimeout(
          readSnapshot(cwd, snapshotId),
          requestTimeoutMs,
          'Request timed out while reading snapshot.',
        )
        if (!snapshot) {
          writeError(response, 404, 'NOT_FOUND', 'Snapshot not found.')
          return
        }
        writeSuccess(response, snapshot)
        emitEvent({
          kind: 'snapshots',
          phase: 'success',
          message: `Snapshot loaded: ${snapshotId}`,
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (pathname.startsWith('/api/snapshots/') && method === 'DELETE') {
        if (!requireWritableMode(response, readonlyStrict, 'Snapshot delete')) {
          return
        }
        const snapshotId = decodeURIComponent(
          pathname.replace('/api/snapshots/', ''),
        )
        if (!snapshotId) {
          writeError(response, 400, 'BAD_REQUEST', 'Snapshot id is required.')
          return
        }
        const deleted = await withRequestTimeout(
          deleteSnapshot(cwd, snapshotId),
          requestTimeoutMs,
          'Request timed out while deleting snapshot.',
        )
        if (!deleted) {
          writeError(response, 404, 'NOT_FOUND', 'Snapshot not found.')
          return
        }
        writeSuccess(response, { id: snapshotId, deleted: true })
        emitEvent({
          kind: 'snapshots',
          phase: 'success',
          message: `Snapshot deleted: ${snapshotId}`,
          timestamp: new Date().toISOString(),
        })
        return
      }

      writeError(response, 404, 'NOT_FOUND', 'Route not found.')
    } catch (error) {
      if (error instanceof PreviewRequestTimeoutError) {
        writeError(response, 408, 'TIMEOUT', error.message)
        emitEvent({
          kind: 'request',
          phase: 'error',
          message: error.message,
          timestamp: new Date().toISOString(),
        })
        return
      }
      writeError(
        response,
        500,
        'INTERNAL',
        error instanceof Error ? error.message : String(error),
      )
      emitEvent({
        kind: 'request',
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
    }
  }

  const nitroApp = createApp()
  nitroApp.use(
    eventHandler(async event => {
      await requestHandler(event.node.req, event.node.res)
    }),
  )
  const server = createServer(toNodeListener(nitroApp))

  const listenResult = await new Promise<{ host: string; port: number }>(
    (resolve, reject) => {
      const tryListen = (candidatePort: number) => {
        const onError = (error: Error) => {
          const nodeError = error as NodeJS.ErrnoException
          server.off('error', onError)
          if (
            nodeError.code === 'EADDRINUSE' &&
            candidatePort > 0 &&
            candidatePort < options.port + 20
          ) {
            tryListen(candidatePort + 1)
            return
          }
          reject(error)
        }

        server.on('error', onError)
        server.listen(candidatePort, options.host, () => {
          server.off('error', onError)
          const addr = server.address()
          const resolvedPort =
            typeof addr === 'object' && addr?.port ? addr.port : candidatePort
          resolve({ host: options.host, port: resolvedPort })
        })
      }
      tryListen(options.port)
    },
  )

  const urlHost =
    listenResult.host === '0.0.0.0' ? '127.0.0.1' : listenResult.host
  const url = `http://${urlHost}:${listenResult.port}`
  cliLogger.success(`Console web server running at ${url}`)
  cliLogger.item('Use Ctrl+C to stop the server.')

  return {
    url,
    token: sessionToken,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

/**
 * @en Validate web host security constraints.
 * @zh 校验 Web 监听地址的安全约束。
 *
 * @param host
 * @en Listen host.
 * @zh 监听主机。
 *
 * @param allowRemote
 * @en Whether remote access is explicitly allowed.
 * @zh 是否显式允许远程访问。
 */
export function validateConsoleHostPolicy(host: string, allowRemote?: boolean) {
  if (host === '0.0.0.0' && !allowRemote) {
    throw new NxspubError('Using --host 0.0.0.0 requires --allow-remote.', 1, {
      silent: false,
    })
  }
}
