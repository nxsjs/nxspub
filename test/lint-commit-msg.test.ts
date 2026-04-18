import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, vi } from 'vitest'
import { lintCommitMsg } from '../src/commands/lint-commit-msg'
import { DEFAULT_CONFIG } from '../src/config'

describe('lintCommitMsg', () => {
  let tempDir: string

  function mockExit() {
    return vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit:${code}`)
      })
  }

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-lint-msg-'))
  })

  afterEach(() => {
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
    const exitSpy = mockExit()

    await expect(
      lintCommitMsg(
        { cwd: tempDir, edit: path.join(tempDir, 'missing.txt') },
        DEFAULT_CONFIG,
      ),
    ).rejects.toThrow('process.exit:1')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('supports custom validator functions and custom error messages', async () => {
    const msgFile = path.join(tempDir, 'COMMIT_EDITMSG')
    await writeFile(msgFile, 'bad message\n')
    const exitSpy = mockExit()

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
    ).rejects.toThrow('process.exit:1')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
