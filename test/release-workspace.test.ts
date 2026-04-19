import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('release workspace', () => {
  it('reuses root package manager when releasing workspace packages', async () => {
    const packageManager = {
      name: 'pnpm' as const,
      runScript: () => ({ bin: 'pnpm', args: ['run', 'build'] }),
      install: () => ({ bin: 'pnpm', args: ['install', '--prefer-offline'] }),
      publish: (args: string[]) => ({
        bin: 'pnpm',
        args: ['publish', ...args],
      }),
      devLintHook: () => 'pnpm run start lint --edit "$1"',
    }
    const releaseSingle = vi.fn().mockResolvedValue(undefined)

    vi.doMock('../src/utils/git', () => ({
      ensureGitSync: vi.fn().mockResolvedValue(undefined),
      getCurrentBranch: vi.fn().mockResolvedValue('main'),
      resolveBranchPolicy: vi.fn().mockReturnValue('latest'),
      run: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('../src/utils/package-manager', () => ({
      detectPackageManager: vi.fn().mockResolvedValue(packageManager),
    }))
    vi.doMock('../src/utils/packages', () => ({
      readJSON: vi.fn().mockResolvedValue({ scripts: { build: 'tsc' } }),
      scanWorkspacePackages: vi.fn().mockResolvedValue([
        {
          name: '@scope/a',
          version: '1.0.0',
          private: false,
          dir: '/repo/packages/a',
          relativeDir: 'packages/a',
          pkgPath: '/repo/packages/a/package.json',
          changelogPath: '/repo/packages/a/CHANGELOG.md',
          archiveDir: '/repo/packages/a/changelogs',
          dependencies: [],
        },
      ]),
      topologicalSort: vi.fn().mockReturnValue(['@scope/a']),
    }))
    vi.doMock('../src/commands/release-single', () => ({ releaseSingle }))

    const { releaseWorkspace } =
      await import('../src/commands/release-workspace')
    await releaseWorkspace(
      { cwd: '/repo', dry: true },
      { branches: { main: 'latest' } },
    )

    expect(releaseSingle).toHaveBeenCalledTimes(1)
    expect(releaseSingle.mock.calls[0][0]).toMatchObject({
      cwd: '/repo/packages/a',
      skipBuild: true,
      resolvedPackageManager: packageManager,
    })
  })

  it('skips packages that do not match branch policy instead of failing the whole release', async () => {
    const releaseSingle = vi.fn().mockResolvedValue(undefined)

    vi.doMock('../src/utils/git', () => ({
      ensureGitSync: vi.fn().mockResolvedValue(undefined),
      getCurrentBranch: vi.fn().mockResolvedValue('main'),
      resolveBranchPolicy: vi.fn().mockReturnValue('latest'),
      run: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock('../src/utils/package-manager', () => ({
      detectPackageManager: vi.fn().mockResolvedValue({
        name: 'pnpm',
        runScript: () => ({ bin: 'pnpm', args: ['run', 'build'] }),
        install: () => ({ bin: 'pnpm', args: ['install', '--prefer-offline'] }),
        publish: (args: string[]) => ({
          bin: 'pnpm',
          args: ['publish', ...args],
        }),
        devLintHook: () => 'pnpm run start lint --edit "$1"',
      }),
    }))
    vi.doMock('../src/utils/packages', () => ({
      readJSON: vi.fn().mockResolvedValue({ scripts: { build: 'tsc' } }),
      scanWorkspacePackages: vi.fn().mockResolvedValue([
        {
          name: '@scope/a',
          version: '1.0.0-alpha.1',
          private: false,
          dir: '/repo/packages/a',
          relativeDir: 'packages/a',
          pkgPath: '/repo/packages/a/package.json',
          changelogPath: '/repo/packages/a/CHANGELOG.md',
          archiveDir: '/repo/packages/a/changelogs',
          dependencies: [],
        },
      ]),
      topologicalSort: vi.fn().mockReturnValue(['@scope/a']),
    }))
    vi.doMock('../src/commands/release-single', () => ({ releaseSingle }))

    const { releaseWorkspace } =
      await import('../src/commands/release-workspace')
    await expect(
      releaseWorkspace(
        { cwd: '/repo', dry: true },
        { branches: { main: 'latest' } },
      ),
    ).resolves.toBeUndefined()

    expect(releaseSingle).not.toHaveBeenCalled()
  })
})
