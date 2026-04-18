import { access, mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, vi } from 'vitest'
import { installGitHooks } from '../src/commands/install-git-hooks'

describe('installGitHooks', () => {
  let tempDir: string

  function mockExit() {
    return vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit:${code}`)
      })
  }

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-hooks-'))
    await mkdir(path.join(tempDir, '.git', 'hooks'), { recursive: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes configured hooks and auto-injects commit-msg in development mode', async () => {
    await mkdir(path.join(tempDir, 'src'), { recursive: true })
    await writeFile(path.join(tempDir, 'src', 'cli.ts'), 'export {}')

    await installGitHooks(
      { cwd: tempDir },
      {
        'git-hooks': {
          'pre-commit': 'pnpm check',
        },
      },
    )

    const preCommit = await readFile(
      path.join(tempDir, '.git', 'hooks', 'pre-commit'),
      'utf8',
    )
    const commitMsg = await readFile(
      path.join(tempDir, '.git', 'hooks', 'commit-msg'),
      'utf8',
    )

    expect(preCommit).toContain('pnpm check')
    expect(commitMsg).toContain('pnpm run start lint --edit "$1"')
  })

  it('does not write files during dry runs', async () => {
    await installGitHooks(
      { cwd: tempDir, dry: true },
      {
        'git-hooks': {
          'pre-commit': 'pnpm check',
        },
      },
    )

    await expect(
      access(path.join(tempDir, '.git', 'hooks', 'pre-commit')),
    ).rejects.toThrow()
  })

  it('aborts when git metadata is missing', async () => {
    const noGitDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-no-git-'))
    const exitSpy = mockExit()

    await expect(
      installGitHooks(
        { cwd: noGitDir },
        {
          'git-hooks': {
            'pre-commit': 'pnpm check',
          },
        },
      ),
    ).rejects.toThrow('process.exit:1')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
