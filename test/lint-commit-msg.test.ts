import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, vi } from 'vitest'
import { lintCommitMsg } from '../src/commands/lint-commit-msg'
import { DEFAULT_CONFIG } from '../src/config'
import { NxspubError } from '../src/utils/errors'

describe('lintCommitMsg', () => {
  let tempDir: string
  const originalGithubRefType = process.env.GITHUB_REF_TYPE
  const originalGithubRefName = process.env.GITHUB_REF_NAME

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-lint-msg-'))
  })

  afterEach(() => {
    process.env.GITHUB_REF_TYPE = originalGithubRefType
    process.env.GITHUB_REF_NAME = originalGithubRefName
    vi.restoreAllMocks()
  })

  it('passes valid commit messages', async () => {
    const msgFile = path.join(tempDir, 'COMMIT_EDITMSG')
    await writeFile(msgFile, 'feat(core): add support for hooks\n')

    await expect(
      lintCommitMsg({ cwd: tempDir, edit: msgFile }, DEFAULT_CONFIG),
    ).resolves.toBeUndefined()
  })

  it('fails when the commit message file does not exist', async () => {
    await expect(
      lintCommitMsg(
        { cwd: tempDir, edit: path.join(tempDir, 'missing.txt') },
        DEFAULT_CONFIG,
      ),
    ).rejects.toBeInstanceOf(NxspubError)
  })

  it('supports custom validator functions and custom error messages', async () => {
    const msgFile = path.join(tempDir, 'COMMIT_EDITMSG')
    await writeFile(msgFile, 'bad message\n')

    await expect(
      lintCommitMsg(
        { cwd: tempDir, edit: msgFile },
        {
          lint: {
            'commit-msg': {
              pattern: () => false,
              message: () => 'custom failure',
            },
          },
        },
      ),
    ).rejects.toBeInstanceOf(NxspubError)
  })

  it('rejects a feat commit on a patch-only branch policy', async () => {
    process.env.GITHUB_REF_TYPE = 'branch'
    process.env.GITHUB_REF_NAME = 'hotfix'

    const msgFile = path.join(tempDir, 'COMMIT_EDITMSG')
    await writeFile(msgFile, 'feat(core): add unsupported feature\n')
    await expect(
      lintCommitMsg(
        { cwd: tempDir, edit: msgFile },
        {
          ...DEFAULT_CONFIG,
          branches: {
            hotfix: 'patch',
          },
        },
      ),
    ).rejects.toBeInstanceOf(NxspubError)
  })

  it('allows a fix commit on a patch-only branch policy', async () => {
    process.env.GITHUB_REF_TYPE = 'branch'
    process.env.GITHUB_REF_NAME = 'hotfix'

    const msgFile = path.join(tempDir, 'COMMIT_EDITMSG')
    await writeFile(msgFile, 'fix(core): patch-safe change\n')

    await expect(
      lintCommitMsg(
        { cwd: tempDir, edit: msgFile },
        {
          ...DEFAULT_CONFIG,
          branches: {
            hotfix: 'patch',
          },
        },
      ),
    ).resolves.toBeUndefined()
  })
})
