import fs, { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('mcp init', () => {
  it('updates existing codex mcp block in ~/.codex/config.toml', async () => {
    const tempHome = await mkdtemp(path.join(os.tmpdir(), 'nxspub-mcp-home-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)

    const codexDir = path.join(tempHome, '.codex')
    await fs.mkdir(codexDir, { recursive: true })
    const configPath = path.join(codexDir, 'config.toml')
    await fs.writeFile(
      configPath,
      `[general]
model = "gpt-5"

[mcp_servers.nxspub]
command = "node"
args = ["./old-server.js"]

[mcp_servers.other]
command = "npx"
args = ["some-other-server"]
`,
      'utf-8',
    )

    const { mcpInitCommand } = await import('../src/commands/mcp')
    await mcpInitCommand({
      cwd: process.cwd(),
      client: 'codex',
    })

    const content = await fs.readFile(configPath, 'utf-8')
    expect(content).toContain('[mcp_servers.nxspub]')
    expect(content).toContain('command = "npx"')
    expect(content).toContain('args = ["nxspub@latest", "mcp"]')
    expect(content).toContain('[mcp_servers.other]')
    expect(content).not.toContain('args = ["./old-server.js"]')
  })

  it('writes claude project config to .mcp.json', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'nxspub-mcp-project-'))
    const { mcpInitCommand } = await import('../src/commands/mcp')

    await mcpInitCommand({
      cwd,
      client: 'claude',
    })

    const configPath = path.join(cwd, '.mcp.json')
    const raw = await fs.readFile(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, { command: string; args: string[] }>
    }
    expect(parsed.mcpServers?.nxspub?.command).toBe('npx')
    expect(parsed.mcpServers?.nxspub?.args).toEqual(['nxspub@latest', 'mcp'])
  })
})
