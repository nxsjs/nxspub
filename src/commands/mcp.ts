import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { McpInitOptions, McpOptions } from './types'
import { startNxspubMcpServer } from '../mcp/server'
import { cliLogger } from '../utils/logger'

type SupportedClient = NonNullable<McpInitOptions['client']>

function normalizeClient(input: string | undefined): SupportedClient {
  if (!input) return 'codex'
  if (
    input === 'claude' ||
    input === 'cursor' ||
    input === 'vscode' ||
    input === 'codex' ||
    input === 'opencode'
  ) {
    return input
  }
  throw new Error(
    `Unsupported MCP client "${input}". Supported values: claude | cursor | vscode | codex | opencode.`,
  )
}

async function readJsonObject(
  filePath: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

async function writeJsonFile(
  filePath: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8')
}

function getNpxServerConfig() {
  return {
    command: 'npx',
    args: ['nxspub@latest', 'mcp'],
  }
}

async function configureClaude(cwd: string) {
  const configPath = path.join(cwd, '.mcp.json')
  const json = await readJsonObject(configPath)
  const mcpServers =
    (json.mcpServers as Record<string, unknown> | undefined) || {}
  mcpServers.nxspub = getNpxServerConfig()
  json.mcpServers = mcpServers
  await writeJsonFile(configPath, json)
  return configPath
}

async function configureCursor(cwd: string) {
  const configPath = path.join(cwd, '.cursor', 'mcp.json')
  const json = await readJsonObject(configPath)
  const mcpServers =
    (json.mcpServers as Record<string, unknown> | undefined) || {}
  mcpServers.nxspub = getNpxServerConfig()
  json.mcpServers = mcpServers
  await writeJsonFile(configPath, json)
  return configPath
}

async function configureVsCode(cwd: string) {
  const configPath = path.join(cwd, '.vscode', 'mcp.json')
  const json = await readJsonObject(configPath)
  const servers = (json.servers as Record<string, unknown> | undefined) || {}
  servers.nxspub = getNpxServerConfig()
  json.servers = servers
  await writeJsonFile(configPath, json)
  return configPath
}

async function configureOpenCode(cwd: string) {
  const configPath = path.join(cwd, '.opencode', 'mcp.json')
  const json = await readJsonObject(configPath)
  const mcpServers =
    (json.mcpServers as Record<string, unknown> | undefined) || {}
  mcpServers.nxspub = getNpxServerConfig()
  json.mcpServers = mcpServers
  await writeJsonFile(configPath, json)
  return configPath
}

async function configureCodex() {
  const configPath = path.join(os.homedir(), '.codex', 'config.toml')
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  const block = `[mcp_servers.nxspub]
command = "npx"
args = ["nxspub@latest", "mcp"]
`
  const existing = await fs.readFile(configPath, 'utf-8').catch(() => '')

  const marker = '[mcp_servers.nxspub]'
  if (!existing.includes(marker)) {
    const prefix = existing.trim().length > 0 ? `${existing.trim()}\n\n` : ''
    await fs.writeFile(configPath, `${prefix}${block}`, 'utf-8')
    return configPath
  }

  const start = existing.indexOf(marker)
  const nextHeaderIndex = existing.indexOf('\n[', start + marker.length)
  const end =
    nextHeaderIndex === -1
      ? existing.length
      : nextHeaderIndex + (existing[nextHeaderIndex - 1] === '\r' ? -1 : 0)

  const before = existing.slice(0, start).trimEnd()
  const after = existing.slice(end).trimStart()
  const updated =
    `${before}${before ? '\n\n' : ''}${block}${after ? `\n${after}` : ''}`.trimEnd() +
    '\n'
  await fs.writeFile(configPath, updated, 'utf-8')
  return configPath
}

/**
 * @en Start nxspub MCP server over stdio transport.
 * @zh 以 stdio 方式启动 nxspub MCP 服务。
 */
export async function mcpCommand(options: McpOptions): Promise<void> {
  await startNxspubMcpServer({
    cwd: path.resolve(options.cwd || process.cwd()),
  })
}

/**
 * @en Initialize MCP client config for nxspub server.
 * @zh 为 nxspub MCP 服务初始化客户端配置。
 */
export async function mcpInitCommand(options: McpInitOptions): Promise<void> {
  const cwd = path.resolve(options.cwd || process.cwd())
  const client = normalizeClient(options.client)

  let configPath: string
  if (client === 'claude') {
    configPath = await configureClaude(cwd)
  } else if (client === 'cursor') {
    configPath = await configureCursor(cwd)
  } else if (client === 'vscode') {
    configPath = await configureVsCode(cwd)
  } else if (client === 'opencode') {
    configPath = await configureOpenCode(cwd)
  } else {
    configPath = await configureCodex()
  }

  cliLogger.success(`MCP config generated for ${client}.`)
  cliLogger.item(configPath)
  cliLogger.dim('Restart your MCP client to load nxspub MCP server.')
}
