import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

it('rolls back local tag when atomic push fails in single-package version flow', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'nxspub-version-single-'))
  await writeFile(
    path.join(cwd, 'package.json'),
    JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2),
    'utf-8',
  )

  const run = vi.fn(async (_bin: string, args: string[]) => {
    if (args[0] === 'push' && args[1] === '--atomic') {
      throw new Error('push failed')
    }
    return { stdout: '' }
  })
  const runSafe = vi.fn(async (_bin: string, args: string[]) => {
    if (args[0] === 'status') return { stdout: ' M package.json' }
    return { stdout: '' }
  })

  vi.doMock('../src/utils/git', () => ({
    createLinkProvider: () => ({
      compare: () => 'https://example.com/compare',
      commit: (hash: string) => `https://example.com/commit/${hash}`,
      pr: (id: string) => `https://example.com/pull/${id}`,
      issue: (id: string) => `https://example.com/issues/${id}`,
      user: (name: string) => `https://example.com/${name}`,
    }),
    ensureGitSync: vi.fn().mockResolvedValue(undefined),
    resolveBranchPolicy: vi.fn().mockReturnValue('latest'),
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
    hasLocalTag: vi.fn().mockResolvedValue(false),
    hasRemoteTag: vi.fn().mockResolvedValue(false),
    getLastReleaseCommit: vi.fn().mockResolvedValue(null),
    getRawCommits: vi.fn().mockResolvedValue([
      {
        hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        message: 'feat: add feature',
      },
    ]),
    getRepoUrl: vi.fn().mockResolvedValue('https://github.com/acme/repo'),
    run,
    runSafe,
  }))
  vi.doMock('../src/utils/package-manager', () => ({
    detectPackageManager: vi.fn().mockResolvedValue({
      name: 'npm',
      install: () => ({ bin: 'npm', args: ['install'] }),
      runScript: () => ({ bin: 'npm', args: ['run', 'build'] }),
      publish: (args: string[]) => ({ bin: 'npm', args: ['publish', ...args] }),
      devLintHook: () => 'npm run start -- lint --edit "$1"',
    }),
  }))

  const { versionSingle } = await import('../src/commands/version-single')

  await expect(
    versionSingle(
      { cwd, dry: false },
      {
        branches: { main: 'latest' },
        versioning: { minor: [/feat:/] },
        changelog: { labels: { feat: 'Features' }, writeOnBranches: [] },
      },
    ),
  ).rejects.toThrow('push failed')

  expect(runSafe).toHaveBeenCalledWith('git', ['tag', '-d', 'v1.1.0'], { cwd })
})
