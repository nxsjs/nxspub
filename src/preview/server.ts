import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import path from 'node:path'
import { URL } from 'node:url'
import { NxspubError } from '../utils/errors'
import { cliLogger } from '../utils/logger'
import {
  buildPreviewChecks,
  buildPreviewResult,
  getDraftHealthSummary,
  getPreviewContext,
  pruneDrafts,
} from './core'
import { renderPreviewWebPage } from './web'
import type { DraftPruneRequest, PreviewResult } from './types'

/**
 * @en Options for starting preview web server.
 * @zh 启动预览 Web 服务的参数。
 */
export interface PreviewServerOptions {
  /** @en Workspace root directory. @zh 工作区根目录。 */
  cwd: string
  /** @en Listen host. @zh 监听主机。 */
  host: string
  /** @en Preferred listen port. @zh 首选监听端口。 */
  port: number
  /** @en Whether prune API is disabled. @zh 是否禁用 prune API。 */
  readonlyStrict?: boolean
}

/**
 * @en Running server handle.
 * @zh 运行中服务句柄。
 */
export interface PreviewServerHandle {
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

function createRequestId(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 12)
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
  const token = request.headers['x-nxspub-preview-token']
  if (token === sessionToken) return true
  writeError(response, 401, 'UNAUTHORIZED', 'Invalid or missing session token.')
  return false
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
export async function startPreviewWebServer(
  options: PreviewServerOptions,
): Promise<PreviewServerHandle> {
  const { cwd, readonlyStrict } = options
  const sessionToken = randomBytes(18).toString('hex')
  let lastPreviewResult: PreviewResult | null = null
  let previewInFlight = false

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(
        request.url || '/',
        `http://${request.headers.host || '127.0.0.1'}`,
      )
      const pathname = requestUrl.pathname
      const method = (request.method || 'GET').toUpperCase()

      if (await tryServeLogo(pathname, cwd, response)) return

      if (pathname === '/' && method === 'GET') {
        response.statusCode = 200
        response.setHeader('content-type', 'text/html; charset=utf-8')
        response.end(renderPreviewWebPage(sessionToken))
        return
      }

      if (!pathname.startsWith('/api/')) {
        writeError(response, 404, 'NOT_FOUND', 'Route not found.')
        return
      }

      if (!requireAuth(request, response, sessionToken)) return

      if (pathname === '/api/health' && method === 'GET') {
        writeSuccess(response, { status: 'ok', version: 'v1' })
        return
      }

      if (pathname === '/api/context' && method === 'GET') {
        const context = await getPreviewContext(cwd)
        writeSuccess(response, context)
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
        try {
          const body = await readJsonBody<{
            branch?: string
            includeChangelog?: boolean
            includeChecks?: boolean
          }>(request)
          const preview = await buildPreviewResult({
            cwd,
            branch: body.branch,
            includeChangelog: body.includeChangelog,
            includeChecks: body.includeChecks,
          })
          if (body.includeChecks) {
            preview.checks = await buildPreviewChecks(cwd, preview)
          }
          lastPreviewResult = preview
          writeSuccess(response, preview)
        } finally {
          previewInFlight = false
        }
        return
      }

      if (pathname === '/api/checks' && method === 'POST') {
        const body = await readJsonBody<{ branch?: string }>(request)
        const preview = await buildPreviewResult({
          cwd,
          branch: body.branch,
          includeChangelog: false,
          includeChecks: false,
        })
        const checks = await buildPreviewChecks(cwd, preview)
        writeSuccess(response, { checks })
        return
      }

      if (pathname === '/api/drafts' && method === 'GET') {
        const target = requestUrl.searchParams.get('target') || undefined
        const draftHealth = await getDraftHealthSummary(cwd, target)
        writeSuccess(response, draftHealth)
        return
      }

      if (pathname === '/api/drafts/prune' && method === 'POST') {
        if (readonlyStrict) {
          writeError(
            response,
            403,
            'FORBIDDEN',
            'Draft prune is disabled in readonly-strict mode.',
          )
          return
        }
        const body = await readJsonBody<DraftPruneRequest>(request)
        if (!body?.target || body.only !== 'behind') {
          writeError(
            response,
            400,
            'BAD_REQUEST',
            'Invalid payload. Expected { target, only: "behind" }.',
          )
          return
        }
        const result = await pruneDrafts(cwd, body)
        writeSuccess(response, result)
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

      writeError(response, 404, 'NOT_FOUND', 'Route not found.')
    } catch (error) {
      writeError(
        response,
        500,
        'INTERNAL',
        error instanceof Error ? error.message : String(error),
      )
    }
  })

  const listenResult = await new Promise<{ host: string; port: number }>(
    (resolve, reject) => {
      const tryListen = (nextPort: number) => {
        server.once('error', error => {
          const nodeError = error as NodeJS.ErrnoException
          if (nodeError.code === 'EADDRINUSE' && nextPort < options.port + 20) {
            tryListen(nextPort + 1)
            return
          }
          reject(error)
        })
        server.listen(nextPort, options.host, () => {
          resolve({
            host: options.host,
            port: nextPort,
          })
        })
      }
      tryListen(options.port)
    },
  )

  const urlHost =
    listenResult.host === '0.0.0.0' ? '127.0.0.1' : listenResult.host
  const url = `http://${urlHost}:${listenResult.port}`
  cliLogger.success(`Preview web server running at ${url}`)
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
export function validatePreviewHostPolicy(host: string, allowRemote?: boolean) {
  if (host === '0.0.0.0' && !allowRemote) {
    throw new NxspubError('Using --host 0.0.0.0 requires --allow-remote.', 1, {
      silent: false,
    })
  }
}
