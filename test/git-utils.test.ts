import { parseCommit } from '../src/utils/changelog'
import { splitGitLogRecord } from '../src/utils/git'

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
  const record = splitGitLogRecord(
    'abc123|feat(core): support pipelines\n\nBREAKING CHANGE: allow a | b syntax',
  )

  expect(record.hash).toBe('abc123')
  expect(record.message).toContain('BREAKING CHANGE: allow a | b syntax')
})
