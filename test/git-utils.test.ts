import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { parseCommit } from '../src/utils/changelog'
import * as gitUtils from '../src/utils/git'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

it('links issue references in commit subjects with the captured issue id', () => {
  const parsed = parseCommit(
    'fix(core): resolve regression in #123',
    'https://github.com/acme/project',
  )

  expect(parsed?.subject).toBe(
    'resolve regression in [#123](https://github.com/acme/project/issues/123)',
  )
})

it('keeps commit body content after pipe characters when parsing git log output', () => {
  const record = gitUtils.parseGitLogRecord(
    'abc123|feat(core): support pipelines\n\nBREAKING CHANGE: allow a | b syntax',
  )

  expect(record.hash).toBe('abc123')
  expect(record.message).toContain('BREAKING CHANGE: allow a | b syntax')
})

it('checks remote tag existence via ls-remote output', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'nxspub-git-utils-'))
  const remoteDir = path.join(tempRoot, 'remote.git')
  const localDir = path.join(tempRoot, 'local')

  await execa('git', ['init', '--bare', remoteDir])
  await execa('git', ['init', '-b', 'main', localDir])
  await execa('git', ['config', 'user.name', 'nxspub-test'], { cwd: localDir })
  await execa('git', ['config', 'user.email', 'nxspub@test.local'], {
    cwd: localDir,
  })
  await writeFile(path.join(localDir, 'README.md'), 'hello\n', 'utf-8')
  await execa('git', ['add', 'README.md'], { cwd: localDir })
  await execa('git', ['commit', '-m', 'feat: init'], { cwd: localDir })
  await execa('git', ['tag', 'v1.0.0'], { cwd: localDir })
  await execa('git', ['remote', 'add', 'origin', remoteDir], { cwd: localDir })
  await execa('git', ['push', '-u', 'origin', 'main'], { cwd: localDir })
  await execa('git', ['push', 'origin', '--tags'], { cwd: localDir })

  await expect(gitUtils.hasRemoteTag(localDir, 'v1.0.0')).resolves.toBe(true)
  await expect(gitUtils.hasRemoteTag(localDir, 'v1.0.1')).resolves.toBe(false)
})
