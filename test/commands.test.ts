import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('command dispatch', () => {
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
    vi.doMock('../src/utils/release-lock', () => ({
      withReleaseLock: async (_cwd: string, task: () => Promise<unknown>) =>
        task(),
    }))
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
    vi.doMock('../src/utils/load-config', () => ({ loadConfig }))
    vi.doMock('../src/utils/git', () => ({ runSafe }))
    vi.doMock('../src/utils/release-lock', () => ({
      withReleaseLock: async (_cwd: string, task: () => Promise<unknown>) =>
        task(),
    }))
    vi.doMock('../src/commands/version-single', () => ({ versionSingle }))
    vi.doMock('../src/commands/version-workspace', () => ({ versionWorkspace }))

    const { versionCommand } = await import('../src/commands/version')
    await expect(versionCommand({ cwd: '/repo' })).rejects.toMatchObject({
      name: 'NxspubError',
      exitCode: 1,
    })

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

    vi.doMock('../src/utils/load-config', () => ({ loadConfig }))
    vi.doMock('../src/commands/install-git-hooks', () => ({ installGitHooks }))

    const { gitHooksCommand } = await import('../src/commands/git-hooks')
    await expect(gitHooksCommand({ cwd: '/repo' })).rejects.toMatchObject({
      name: 'NxspubError',
      exitCode: 1,
    })
  })

  it('releaseSingle uses the detected package manager for build and publish', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const ensureGitSync = vi.fn().mockResolvedValue(undefined)
    const getCurrentBranch = vi.fn().mockResolvedValue('main')
    const detectPackageManager = vi.fn().mockResolvedValue({
      name: 'npm',
      runScript: () => ({ bin: 'npm', args: ['run', 'build'] }),
      install: () => ({ bin: 'npm', args: ['install'] }),
      publish: (args: string[]) => ({ bin: 'npm', args: ['publish', ...args] }),
      devLintHook: () => 'npm run start -- lint --edit "$1"',
    })
    const readJSON = vi.fn().mockResolvedValue({
      name: 'demo',
      version: '1.0.0',
      scripts: { build: 'tsc' },
    })
    const checkVersionExists = vi.fn().mockResolvedValue(false)

    vi.doMock('../src/utils/git', () => ({
      ensureGitSync,
      resolveBranchPolicy: () => 'latest',
      getCurrentBranch,
      run,
    }))
    vi.doMock('../src/utils/package-manager', () => ({ detectPackageManager }))
    vi.doMock('../src/utils/packages', () => ({ readJSON }))
    vi.doMock('../src/utils/npm', () => ({ checkVersionExists }))
    vi.doUnmock('../src/commands/release-single')

    const { releaseSingle } = await import('../src/commands/release-single')
    await releaseSingle(
      { cwd: '/repo', skipSync: true },
      { scripts: { releaseBuild: 'npm run build' } },
    )

    expect(run).toHaveBeenNthCalledWith(1, 'npm run build', [], {
      cwd: '/repo',
      shell: true,
    })
    expect(run).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['publish', '--no-git-checks', '--access', 'public'],
      { cwd: '/repo' },
    )
  })

  it('releaseSingle blocks prerelease versions on non-prerelease branch policy', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const ensureGitSync = vi.fn().mockResolvedValue(undefined)
    const getCurrentBranch = vi.fn().mockResolvedValue('main')
    const detectPackageManager = vi.fn().mockResolvedValue({
      name: 'npm',
      runScript: () => ({ bin: 'npm', args: ['run', 'build'] }),
      install: () => ({ bin: 'npm', args: ['install'] }),
      publish: (args: string[]) => ({ bin: 'npm', args: ['publish', ...args] }),
      devLintHook: () => 'npm run start -- lint --edit "$1"',
    })
    const readJSON = vi.fn().mockResolvedValue({
      name: 'demo',
      version: '1.2.3-alpha.1',
      scripts: { build: 'tsc' },
    })
    const checkVersionExists = vi.fn().mockResolvedValue(false)

    vi.doMock('../src/utils/git', () => ({
      ensureGitSync,
      resolveBranchPolicy: () => 'latest',
      getCurrentBranch,
      run,
    }))
    vi.doMock('../src/utils/package-manager', () => ({ detectPackageManager }))
    vi.doMock('../src/utils/packages', () => ({ readJSON }))
    vi.doMock('../src/utils/npm', () => ({ checkVersionExists }))
    vi.doUnmock('../src/commands/release-single')

    const { releaseSingle } = await import('../src/commands/release-single')
    await expect(
      releaseSingle({ cwd: '/repo', skipSync: true }, {}),
    ).rejects.toMatchObject({
      name: 'NxspubError',
      exitCode: 1,
    })

    expect(checkVersionExists).not.toHaveBeenCalled()
  })
})
