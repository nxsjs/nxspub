import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('console command', () => {
  it('prints JSON in terminal mode when --json is enabled', async () => {
    const buildPreviewResult = vi.fn().mockResolvedValue({
      mode: 'single',
      branch: 'main',
      policy: { branch: 'main', policy: 'latest', ok: true },
      currentVersion: '1.0.0',
      targetVersion: '1.0.1',
      commitCount: 1,
      releasePackageCount: 1,
    })
    const buildPreviewChecksReport = vi.fn().mockResolvedValue({
      policy: { ok: true },
      gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
      tagConflicts: [],
      registryConflicts: [],
      items: [],
    })
    const stdoutWrite = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    vi.doMock('../src/console/core', () => ({
      buildPreviewResult,
      buildPreviewChecksReport,
    }))
    vi.doMock('../src/console/server', () => ({
      startConsoleWebServer: vi.fn(),
      validateConsoleHostPolicy: vi.fn(),
    }))
    vi.doMock('../src/utils/git', () => ({
      runSafe: vi.fn(),
    }))

    const { consoleCommand } = await import('../src/commands/console')
    await consoleCommand({ cwd: '/repo', json: true })

    expect(buildPreviewResult).toHaveBeenCalledWith({
      cwd: '/repo',
      branch: undefined,
      includeChangelog: true,
      includeChecks: false,
    })
    expect(stdoutWrite).toHaveBeenCalledTimes(1)
  })

  it('starts preview web server in --web mode', async () => {
    const startConsoleWebServer = vi.fn().mockResolvedValue({
      url: 'http://127.0.0.1:4173',
      token: 'token',
      close: vi.fn(),
    })
    const validateConsoleHostPolicy = vi.fn()

    vi.doMock('../src/console/core', () => ({
      buildPreviewResult: vi.fn(),
      buildPreviewChecksReport: vi.fn(),
    }))
    vi.doMock('../src/console/server', () => ({
      startConsoleWebServer,
      validateConsoleHostPolicy,
    }))
    vi.doMock('../src/utils/git', () => ({
      runSafe: vi.fn(),
    }))

    const { consoleCommand } = await import('../src/commands/console')
    await consoleCommand({
      cwd: '/repo',
      web: true,
      host: '127.0.0.1',
      port: 4173,
      open: false,
    })

    expect(validateConsoleHostPolicy).toHaveBeenCalledWith(
      '127.0.0.1',
      undefined,
    )
    expect(startConsoleWebServer).toHaveBeenCalledWith({
      cwd: '/repo',
      host: '127.0.0.1',
      port: 4173,
      readonlyStrict: undefined,
      apiOnly: undefined,
    })
  })

  it('prints API token when running in --api-only mode', async () => {
    const startConsoleWebServer = vi.fn().mockResolvedValue({
      url: 'http://127.0.0.1:4173',
      token: 'preview-token',
      close: vi.fn(),
    })
    const validateConsoleHostPolicy = vi.fn()
    const step = vi.fn()
    const item = vi.fn()

    vi.doMock('../src/console/core', () => ({
      buildPreviewResult: vi.fn(),
      buildPreviewChecksReport: vi.fn(),
    }))
    vi.doMock('../src/console/server', () => ({
      startConsoleWebServer,
      validateConsoleHostPolicy,
    }))
    vi.doMock('../src/utils/git', () => ({
      runSafe: vi.fn(),
    }))
    vi.doMock('../src/utils/logger', () => ({
      cliLogger: {
        step,
        item,
        success: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        highlight: (text: string) => text,
        dim: vi.fn(),
        divider: vi.fn(),
        log: vi.fn(),
      },
    }))

    const { consoleCommand } = await import('../src/commands/console')
    await consoleCommand({
      cwd: '/repo',
      web: true,
      apiOnly: true,
      host: '127.0.0.1',
      port: 4173,
      open: false,
    })

    expect(step).toHaveBeenCalledWith('Console API Token')
    expect(item).toHaveBeenCalledWith('x-nxspub-console-token: preview-token')
  })

  it('forwards host policy related flags in web mode', async () => {
    const startConsoleWebServer = vi.fn().mockResolvedValue({
      url: 'http://127.0.0.1:4173',
      token: 'token',
      close: vi.fn(),
    })
    const validateConsoleHostPolicy = vi.fn()

    vi.doMock('../src/console/core', () => ({
      buildPreviewResult: vi.fn(),
      buildPreviewChecksReport: vi.fn(),
    }))
    vi.doMock('../src/console/server', () => ({
      startConsoleWebServer,
      validateConsoleHostPolicy,
    }))
    vi.doMock('../src/utils/git', () => ({
      runSafe: vi.fn(),
    }))

    const { consoleCommand } = await import('../src/commands/console')
    await consoleCommand({
      cwd: '/repo',
      web: true,
      host: '0.0.0.0',
      allowRemote: true,
      port: 5181,
      readonlyStrict: true,
      apiOnly: true,
      open: false,
    })

    expect(validateConsoleHostPolicy).toHaveBeenCalledWith('0.0.0.0', true)
    expect(startConsoleWebServer).toHaveBeenCalledWith({
      cwd: '/repo',
      host: '0.0.0.0',
      port: 5181,
      readonlyStrict: true,
      apiOnly: true,
    })
  })

  it('blocks --web mode when console web feature flag is disabled', async () => {
    const startConsoleWebServer = vi.fn()
    const validateConsoleHostPolicy = vi.fn()
    vi.stubEnv('NXSPUB_CONSOLE_WEB_ENABLED', 'false')

    vi.doMock('../src/console/core', () => ({
      buildPreviewResult: vi.fn(),
      buildPreviewChecksReport: vi.fn(),
    }))
    vi.doMock('../src/console/server', () => ({
      startConsoleWebServer,
      validateConsoleHostPolicy,
    }))
    vi.doMock('../src/utils/git', () => ({
      runSafe: vi.fn(),
    }))

    const { consoleCommand } = await import('../src/commands/console')

    await expect(
      consoleCommand({
        cwd: '/repo',
        web: true,
        host: '127.0.0.1',
        port: 4173,
      }),
    ).rejects.toThrow(
      'console --web is disabled by NXSPUB_CONSOLE_WEB_ENABLED.',
    )

    expect(validateConsoleHostPolicy).not.toHaveBeenCalled()
    expect(startConsoleWebServer).not.toHaveBeenCalled()
  })
})
