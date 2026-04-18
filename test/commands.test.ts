import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('command dispatch', () => {
  function mockExit() {
    return vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit:${code}`)
      })
  }

  it('lintCommand loads config and delegates when edit is provided', async () => {
    const loadConfig = vi.fn().mockResolvedValue({ lint: {} })
    const lintCommitMsg = vi.fn().mockResolvedValue(undefined)

    vi.doMock('../src/utils/load-config', () => ({ loadConfig }))
    vi.doMock('../src/commands/lint-commit-msg', () => ({ lintCommitMsg }))

    const { lintCommand } = await import('../src/commands/lint')
    await lintCommand({ cwd: '/repo', edit: '.git/COMMIT_EDITMSG' })

    expect(loadConfig).toHaveBeenCalledWith('/repo')
    expect(lintCommitMsg).toHaveBeenCalled()
  })

  it('releaseCommand picks workspace or single mode based on config', async () => {
    const loadConfig = vi
      .fn()
      .mockResolvedValueOnce({ workspace: { mode: 'locked' } })
      .mockResolvedValueOnce({})
    const releaseWorkspace = vi.fn().mockResolvedValue(undefined)
    const releaseSingle = vi.fn().mockResolvedValue(undefined)

    vi.doMock('../src/utils/load-config', () => ({ loadConfig }))
    vi.doMock('../src/commands/release-workspace', () => ({ releaseWorkspace }))
    vi.doMock('../src/commands/release-single', () => ({ releaseSingle }))

    const { releaseCommand } = await import('../src/commands/release')

    await releaseCommand({ cwd: '/repo-a' })
    await releaseCommand({ cwd: '/repo-b' })

    expect(releaseWorkspace).toHaveBeenCalledTimes(1)
    expect(releaseSingle).toHaveBeenCalledTimes(1)
  })

  it('versionCommand blocks dirty working trees outside dry mode', async () => {
    const loadConfig = vi.fn().mockResolvedValue({})
    const runSafe = vi.fn().mockResolvedValue({ stdout: ' M package.json' })
    const versionSingle = vi.fn()
    const versionWorkspace = vi.fn()
    const exitSpy = mockExit()

    vi.doMock('../src/utils/load-config', () => ({ loadConfig }))
    vi.doMock('../src/utils/git', () => ({ runSafe }))
    vi.doMock('../src/commands/version-single', () => ({ versionSingle }))
    vi.doMock('../src/commands/version-workspace', () => ({ versionWorkspace }))

    const { versionCommand } = await import('../src/commands/version')
    await expect(versionCommand({ cwd: '/repo' })).rejects.toThrow(
      'process.exit:1',
    )

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(versionSingle).not.toHaveBeenCalled()
    expect(versionWorkspace).not.toHaveBeenCalled()
  })

  it('versionCommand dispatches after a clean status check', async () => {
    const loadConfig = vi
      .fn()
      .mockResolvedValue({ workspace: { mode: 'locked' } })
    const runSafe = vi.fn().mockResolvedValue({ stdout: '' })
    const versionSingle = vi.fn()
    const versionWorkspace = vi.fn().mockResolvedValue(undefined)

    vi.doMock('../src/utils/load-config', () => ({ loadConfig }))
    vi.doMock('../src/utils/git', () => ({ runSafe }))
    vi.doMock('../src/commands/version-single', () => ({ versionSingle }))
    vi.doMock('../src/commands/version-workspace', () => ({ versionWorkspace }))

    const { versionCommand } = await import('../src/commands/version')
    await versionCommand({ cwd: '/repo', dry: false })

    expect(runSafe).toHaveBeenCalledWith('git', ['status', '--porcelain'], {
      cwd: '/repo',
    })
    expect(versionWorkspace).toHaveBeenCalledTimes(1)
  })

  it('gitHooksCommand catches install errors and exits', async () => {
    const loadConfig = vi.fn().mockResolvedValue({})
    const installGitHooks = vi.fn().mockRejectedValue(new Error('boom'))
    const exitSpy = mockExit()

    vi.doMock('../src/utils/load-config', () => ({ loadConfig }))
    vi.doMock('../src/commands/install-git-hooks', () => ({ installGitHooks }))

    const { gitHooksCommand } = await import('../src/commands/git-hooks')
    await expect(gitHooksCommand({ cwd: '/repo' })).rejects.toThrow(
      'process.exit:1',
    )

    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
