import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('mcp server', () => {
  it('handles initialize request', async () => {
    const { processNxspubMcpRequest } = await import('../src/mcp/server')
    const result = await processNxspubMcpRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      },
      { cwd: '/repo' },
    )

    expect(result.response?.result).toMatchObject({
      protocolVersion: '2024-11-05',
      capabilities: { tools: { listChanged: false } },
    })
  })

  it('returns tool list with execution tools', async () => {
    const { processNxspubMcpRequest } = await import('../src/mcp/server')
    const result = await processNxspubMcpRequest(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      },
      { cwd: '/repo' },
    )

    const tools = (
      result.response?.result as { tools: Array<{ name: string }> }
    ).tools.map(item => item.name)
    expect(tools).toContain('nxspub_version')
    expect(tools).toContain('nxspub_release')
    expect(tools).toContain('nxspub_deploy_execute')
  })

  it('rejects non-dry version execution without confirm', async () => {
    vi.doMock('../src/commands/version', () => ({
      versionCommand: vi.fn(),
    }))

    const { processNxspubMcpRequest } = await import('../src/mcp/server')
    await expect(
      processNxspubMcpRequest(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'nxspub_version',
            arguments: {
              cwd: '/repo',
              dry: false,
            },
          },
        },
        { cwd: '/repo' },
      ),
    ).rejects.toThrow('confirm="YES"')
  })

  it('executes version when confirm is YES', async () => {
    const versionCommand = vi.fn().mockResolvedValue(undefined)
    vi.doMock('../src/commands/version', () => ({
      versionCommand,
    }))

    const { processNxspubMcpRequest } = await import('../src/mcp/server')
    const result = await processNxspubMcpRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'nxspub_version',
          arguments: {
            cwd: '/repo',
            dry: false,
            confirm: 'YES',
          },
        },
      },
      { cwd: '/repo' },
    )

    expect(versionCommand).toHaveBeenCalledWith({
      cwd: '/repo',
      dry: false,
    })
    expect(result.response?.result).toMatchObject({
      structuredContent: {
        ok: true,
        command: 'version',
        dry: false,
      },
    })
  })
})
