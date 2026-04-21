import fs from 'node:fs/promises'
import path from 'node:path'
import pkg from '../../package.json'
import { releaseCommand } from '../commands/release'
import { versionCommand } from '../commands/version'
import {
  buildPreviewChecksReport,
  buildPreviewResult,
  getPreviewContext,
} from '../console/core'
import type { PreviewResult } from '../console/types'
import { buildDeployPlan, runDeploy, runDeployRollback } from '../deploy/core'
import type { DeployStrategy } from '../deploy/types'
import { loadConfig } from '../utils/load-config'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

interface McpToolDescriptor {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface StartMcpServerOptions {
  cwd: string
}

function writeRpcPayload(payload: JsonRpcResponse) {
  const body = JSON.stringify(payload)
  const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`
  process.stdout.write(header)
  process.stdout.write(body)
}

function writeRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
) {
  writeRpcPayload({
    jsonrpc: '2.0',
    id,
    error: { code, message, data },
  })
}

function parseContentLength(rawHeader: string): number | null {
  const lines = rawHeader.split('\r\n')
  for (const line of lines) {
    const [key, value] = line.split(':', 2)
    if (!key || !value) continue
    if (key.trim().toLowerCase() !== 'content-length') continue
    const parsed = Number(value.trim())
    if (!Number.isFinite(parsed) || parsed < 0) return null
    return parsed
  }
  return null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asDeployStrategy(value: unknown): DeployStrategy | undefined {
  return value === 'rolling' || value === 'canary' || value === 'blue-green'
    ? value
    : undefined
}

function toToolTextResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  }
}

function ensureNonDryConfirmed(
  dry: boolean,
  confirmValue: string | undefined,
  toolName: string,
) {
  if (dry) return
  if (confirmValue === 'YES') return
  throw new Error(`${toolName}: non-dry execution requires confirm="YES".`)
}

function getToolDescriptors(): McpToolDescriptor[] {
  return [
    {
      name: 'nxspub_get_context',
      description:
        'Read basic nxspub preview context (branch/package manager/mode).',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Optional workspace root path.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'nxspub_preview',
      description:
        'Compute preview result (target version, package plans, changelog preview, checks).',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Optional workspace root path.' },
          branch: {
            type: 'string',
            description: 'Optional branch override for simulation.',
          },
          includeChangelog: { type: 'boolean', default: true },
          includeChecks: { type: 'boolean', default: true },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'nxspub_draft_health',
      description:
        'Inspect changelog draft health summary for a target stable version.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Optional workspace root path.' },
          targetVersion: {
            type: 'string',
            description: 'Optional target stable version (x.y.z).',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'nxspub_deploy_plan',
      description:
        'Build deploy plan using current nxspub config and runtime options.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Optional workspace root path.' },
          env: { type: 'string' },
          strategy: {
            type: 'string',
            enum: ['rolling', 'canary', 'blue-green'],
          },
          branch: { type: 'string' },
          dry: { type: 'boolean', default: true },
          skipChecks: { type: 'boolean', default: false },
          concurrency: { type: 'number', minimum: 1 },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'nxspub_validate_config',
      description:
        'Validate and return normalized nxspub config for current workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Optional workspace root path.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'nxspub_version',
      description:
        'Run nxspub version flow. Default dry-run; non-dry requires confirm="YES".',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Optional workspace root path.' },
          dry: { type: 'boolean', default: true },
          confirm: {
            type: 'string',
            description:
              'Required as "YES" when dry=false to allow write operations.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'nxspub_release',
      description:
        'Run nxspub release flow. Default dry-run; non-dry requires confirm="YES".',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Optional workspace root path.' },
          dry: { type: 'boolean', default: true },
          provenance: { type: 'boolean', default: false },
          registry: { type: 'string' },
          access: { type: 'string' },
          tag: { type: 'string' },
          branch: { type: 'string' },
          skipBuild: { type: 'boolean', default: false },
          skipSync: { type: 'boolean', default: false },
          confirm: {
            type: 'string',
            description:
              'Required as "YES" when dry=false to allow publish operations.',
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'nxspub_deploy_execute',
      description:
        'Run deploy execution or rollback. Default dry-run execute; non-dry or rollback requires confirm="YES".',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Optional workspace root path.' },
          env: { type: 'string' },
          strategy: {
            type: 'string',
            enum: ['rolling', 'canary', 'blue-green'],
          },
          branch: { type: 'string' },
          dry: { type: 'boolean', default: true },
          rollback: { type: 'boolean', default: false },
          to: { type: 'string', description: 'Rollback target deployment id.' },
          skipChecks: { type: 'boolean', default: false },
          concurrency: { type: 'number', minimum: 1 },
          confirm: {
            type: 'string',
            description: 'Required as "YES" when dry=false or rollback=true.',
          },
        },
        additionalProperties: false,
      },
    },
  ]
}

async function getDraftHealthSummary(
  cwd: string,
  targetVersion?: string,
): Promise<unknown> {
  const draftRoot = path.join(cwd, '.nxspub', 'changelog-drafts')
  const summary = {
    totalDraftFiles: 0,
    branchDirectories: 0,
    files: [] as Array<{
      branchDirectory: string
      fileName: string
      version?: string
      generatedAt?: string
      itemsCount?: number
      relation?: 'matching' | 'behind' | 'ahead' | 'invalid'
      malformed?: boolean
    }>,
  }

  const coreTarget = targetVersion?.split('-')[0]

  try {
    const branchDirs = await fs.readdir(draftRoot, { withFileTypes: true })
    for (const branchDir of branchDirs) {
      if (!branchDir.isDirectory()) continue
      summary.branchDirectories += 1
      const branchPath = path.join(draftRoot, branchDir.name)
      const files = await fs.readdir(branchPath, { withFileTypes: true })
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.json')) continue
        summary.totalDraftFiles += 1

        const absoluteFile = path.join(branchPath, file.name)
        try {
          const raw = await fs.readFile(absoluteFile, 'utf-8')
          const parsed = JSON.parse(raw) as {
            version?: string
            generatedAt?: string
            items?: unknown[]
          }
          const version = asString(parsed.version)
          const coreVersion = version ? version.split('-')[0] : undefined
          let relation: 'matching' | 'behind' | 'ahead' | 'invalid' | undefined
          if (coreTarget && coreVersion) {
            if (!/^\d+\.\d+\.\d+$/.test(coreVersion)) {
              relation = 'invalid'
            } else if (coreVersion === coreTarget) {
              relation = 'matching'
            } else {
              const toTuple = (v: string) => v.split('.').map(Number)
              const [a1, a2, a3] = toTuple(coreVersion)
              const [b1, b2, b3] = toTuple(coreTarget)
              if ([a1, a2, a3, b1, b2, b3].some(n => Number.isNaN(n))) {
                relation = 'invalid'
              } else if (
                a1 < b1 ||
                (a1 === b1 && a2 < b2) ||
                (a1 === b1 && a2 === b2 && a3 < b3)
              ) {
                relation = 'behind'
              } else {
                relation = 'ahead'
              }
            }
          }

          summary.files.push({
            branchDirectory: branchDir.name,
            fileName: file.name,
            version,
            generatedAt: asString(parsed.generatedAt),
            itemsCount: Array.isArray(parsed.items) ? parsed.items.length : 0,
            relation,
          })
        } catch {
          summary.files.push({
            branchDirectory: branchDir.name,
            fileName: file.name,
            malformed: true,
          })
        }
      }
    }
  } catch {
    // empty drafts is a valid state
  }

  return summary
}

async function handleToolCall(
  toolName: string,
  rawArgs: Record<string, unknown> | undefined,
  options: StartMcpServerOptions,
) {
  const args = rawArgs || {}
  const cwd = asString(args.cwd) || options.cwd

  if (toolName === 'nxspub_get_context') {
    const context = await getPreviewContext(cwd)
    return toToolTextResult(context)
  }

  if (toolName === 'nxspub_preview') {
    const includeChangelog = asBoolean(args.includeChangelog) ?? true
    const includeChecks = asBoolean(args.includeChecks) ?? true
    const branch = asString(args.branch)

    const preview = await buildPreviewResult({
      cwd,
      branch,
      includeChangelog,
      includeChecks: false,
    })
    const checks = includeChecks
      ? await buildPreviewChecksReport(cwd, preview as PreviewResult)
      : []
    return toToolTextResult({
      ...preview,
      checks,
    })
  }

  if (toolName === 'nxspub_draft_health') {
    const targetVersion = asString(args.targetVersion)
    const summary = await getDraftHealthSummary(cwd, targetVersion)
    return toToolTextResult(summary)
  }

  if (toolName === 'nxspub_deploy_plan') {
    const config = await loadConfig(cwd)
    const plan = await buildDeployPlan(
      {
        cwd,
        env: asString(args.env),
        strategy: asDeployStrategy(args.strategy),
        branch: asString(args.branch),
        dry: asBoolean(args.dry) ?? true,
        skipChecks: asBoolean(args.skipChecks) ?? false,
        concurrency: asNumber(args.concurrency),
      },
      config,
    )
    return toToolTextResult(plan)
  }

  if (toolName === 'nxspub_validate_config') {
    const config = await loadConfig(cwd)
    return toToolTextResult(config)
  }

  if (toolName === 'nxspub_version') {
    const dry = asBoolean(args.dry) ?? true
    ensureNonDryConfirmed(dry, asString(args.confirm), toolName)
    await versionCommand({
      cwd,
      dry,
    })
    return toToolTextResult({
      ok: true,
      command: 'version',
      dry,
      cwd,
    })
  }

  if (toolName === 'nxspub_release') {
    const dry = asBoolean(args.dry) ?? true
    ensureNonDryConfirmed(dry, asString(args.confirm), toolName)
    const summary = await releaseCommand({
      cwd,
      dry,
      provenance: asBoolean(args.provenance) ?? false,
      registry: asString(args.registry),
      access: asString(args.access),
      tag: asString(args.tag),
      branch: asString(args.branch),
      skipBuild: asBoolean(args.skipBuild) ?? false,
      skipSync: asBoolean(args.skipSync) ?? false,
    })
    return toToolTextResult({
      ok: true,
      command: 'release',
      dry,
      cwd,
      summary,
    })
  }

  if (toolName === 'nxspub_deploy_execute') {
    const rollback = asBoolean(args.rollback) ?? false
    const dry = rollback ? false : (asBoolean(args.dry) ?? true)
    if (rollback) {
      ensureNonDryConfirmed(false, asString(args.confirm), toolName)
      const config = await loadConfig(cwd)
      const rollbackResult = await runDeployRollback(
        {
          cwd,
          rollback: true,
          to: asString(args.to),
          env: asString(args.env),
          branch: asString(args.branch),
        },
        config,
      )
      return toToolTextResult({
        ok: true,
        command: 'deploy:rollback',
        cwd,
        result: rollbackResult,
      })
    }

    ensureNonDryConfirmed(dry, asString(args.confirm), toolName)
    const config = await loadConfig(cwd)
    const deployResult = await runDeploy(
      {
        cwd,
        env: asString(args.env),
        strategy: asDeployStrategy(args.strategy),
        branch: asString(args.branch),
        dry,
        skipChecks: asBoolean(args.skipChecks) ?? false,
        concurrency: asNumber(args.concurrency),
      },
      config,
    )
    return toToolTextResult({
      ok: true,
      command: 'deploy',
      dry,
      cwd,
      result: deployResult,
    })
  }

  throw new Error(`Unsupported tool: ${toolName}`)
}

interface ProcessMcpRequestResult {
  response?: JsonRpcResponse
  shouldExit?: boolean
}

/**
 * @en Process one MCP JSON-RPC request and return response payload.
 * @zh 处理单个 MCP JSON-RPC 请求并返回响应载荷。
 */
export async function processNxspubMcpRequest(
  request: JsonRpcRequest,
  options: StartMcpServerOptions,
): Promise<ProcessMcpRequestResult> {
  if (request.method === 'notifications/initialized') {
    return {}
  }

  if (request.method === 'ping') {
    return {
      response: {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {},
      },
    }
  }

  if (request.method === 'initialize') {
    return {
      response: {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: 'nxspub',
            version: pkg.version,
          },
        },
      },
    }
  }

  if (request.method === 'tools/list') {
    return {
      response: {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {
          tools: getToolDescriptors(),
        },
      },
    }
  }

  if (request.method === 'tools/call') {
    const params = request.params || {}
    const toolName = asString(params.name)
    if (!toolName) {
      throw new Error('tools/call requires params.name')
    }
    const rawArgs =
      typeof params.arguments === 'object' &&
      params.arguments &&
      !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : undefined
    const result = await handleToolCall(toolName, rawArgs, options)
    return {
      response: {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result,
      },
    }
  }

  if (request.method === 'shutdown') {
    return {
      response: {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {},
      },
    }
  }

  if (request.method === 'exit') {
    return { shouldExit: true }
  }

  if (request.id !== undefined) {
    return {
      response: {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`,
        },
      },
    }
  }

  return {}
}

/**
 * @en Start nxspub MCP server over stdio.
 * @zh 通过 stdio 启动 nxspub MCP 服务。
 */
export async function startNxspubMcpServer(
  options: StartMcpServerOptions,
): Promise<void> {
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  let buffer = ''

  process.stdin.on('data', async chunk => {
    buffer += chunk
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const headerRaw = buffer.slice(0, headerEnd)
      const contentLength = parseContentLength(headerRaw)
      if (contentLength === null) {
        writeRpcError(null, -32700, 'Invalid Content-Length header.')
        buffer = ''
        return
      }

      const messageStart = headerEnd + 4
      const messageEnd = messageStart + contentLength
      if (buffer.length < messageEnd) return

      const messageRaw = buffer.slice(messageStart, messageEnd)
      buffer = buffer.slice(messageEnd)

      let request: JsonRpcRequest
      try {
        request = JSON.parse(messageRaw) as JsonRpcRequest
      } catch {
        writeRpcError(null, -32700, 'Invalid JSON payload.')
        continue
      }

      try {
        const handled = await processNxspubMcpRequest(request, options)
        if (handled.response) {
          writeRpcPayload(handled.response)
        }
        if (handled.shouldExit) {
          process.exit(0)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        writeRpcError(request.id ?? null, -32000, message)
      }
    }
  })
}
