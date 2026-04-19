import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('preview command', () => {
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
    const buildPreviewChecks = vi.fn().mockResolvedValue([])
    const stdoutWrite = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    vi.doMock('../src/preview/core', () => ({
      buildPreviewResult,
      buildPreviewChecks,
    }))
    vi.doMock('../src/preview/server', () => ({
      startPreviewWebServer: vi.fn(),
      validatePreviewHostPolicy: vi.fn(),
    }))
    vi.doMock('../src/utils/git', () => ({
      runSafe: vi.fn(),
    }))

    const { previewCommand } = await import('../src/commands/preview')
    await previewCommand({ cwd: '/repo', json: true })

    expect(buildPreviewResult).toHaveBeenCalledWith({
      cwd: '/repo',
      branch: undefined,
      includeChangelog: true,
      includeChecks: false,
    })
    expect(stdoutWrite).toHaveBeenCalledTimes(1)
  })

  it('starts preview web server in --web mode', async () => {
    const startPreviewWebServer = vi.fn().mockResolvedValue({
      url: 'http://127.0.0.1:4173',
      token: 'token',
      close: vi.fn(),
    })
    const validatePreviewHostPolicy = vi.fn()

    vi.doMock('../src/preview/core', () => ({
      buildPreviewResult: vi.fn(),
      buildPreviewChecks: vi.fn(),
    }))
    vi.doMock('../src/preview/server', () => ({
      startPreviewWebServer,
      validatePreviewHostPolicy,
    }))
    vi.doMock('../src/utils/git', () => ({
      runSafe: vi.fn(),
    }))

    const { previewCommand } = await import('../src/commands/preview')
    await previewCommand({
      cwd: '/repo',
      web: true,
      host: '127.0.0.1',
      port: 4173,
      open: false,
    })

    expect(validatePreviewHostPolicy).toHaveBeenCalledWith(
      '127.0.0.1',
      undefined,
    )
    expect(startPreviewWebServer).toHaveBeenCalledWith({
      cwd: '/repo',
      host: '127.0.0.1',
      port: 4173,
      readonlyStrict: undefined,
    })
  })
})
