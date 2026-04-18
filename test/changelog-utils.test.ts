import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, vi } from 'vitest'

vi.mock('../src/utils/git', async () => {
  const actual =
    await vi.importActual<typeof import('../src/utils/git')>('../src/utils/git')

  return {
    ...actual,
    getContributors: vi.fn(),
  }
})

import {
  applyContributorsToChangelog,
  archiveChangelogIfNeeded,
  cleanupExistingEntry,
  parseCommit,
} from '../src/utils/changelog'
import { getContributors } from '../src/utils/git'

describe('changelog helpers', () => {
  let tempDir: string

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-18T00:00:00.000Z'))
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-changelog-'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('removes an existing version section before prepending a new one', () => {
    const content = [
      '## [1.1.0](link) (2026-04-18)',
      '',
      'new entry',
      '',
      '## [1.0.0](link) (2026-04-17)',
      '',
      'old entry',
    ].join('\n')

    expect(cleanupExistingEntry(content, '1.1.0')).toContain('## [1.0.0]')
    expect(cleanupExistingEntry(content, '1.1.0')).not.toContain('new entry')
  })

  it('parses commit details including prs, issues, breaking changes, and body lines', () => {
    const parsed = parseCommit(
      [
        'feat(core)!: add new parser (#10) #42',
        '',
        '- keep this detail',
        'closes #99 #100',
        'BREAKING CHANGE: old parser API removed',
      ].join('\n'),
      'https://github.com/acme/repo',
    )

    expect(parsed).toMatchObject({
      type: 'feat',
      scope: 'core',
      isBreaking: true,
      breakingDetail: 'old parser API removed',
    })
    expect(parsed?.subject).toContain(
      '[#42](https://github.com/acme/repo/issues/42)',
    )
    expect(parsed?.prLinks).toEqual([
      '([#10](https://github.com/acme/repo/pull/10))',
    ])
    expect(parsed?.linkedIssues).toEqual([
      '[#99](https://github.com/acme/repo/issues/99)',
      '[#100](https://github.com/acme/repo/issues/100)',
    ])
    expect(parsed?.bodyLines).toEqual(['- keep this detail'])
  })

  it('appends contributor sections when contributor data exists', async () => {
    vi.mocked(getContributors).mockResolvedValue({
      all: [
        {
          name: 'alice',
          email: 'alice@example.com',
          avatar: 'https://example.com/alice.png',
          url: 'https://github.com/alice',
        },
      ],
      new: [
        {
          name: 'alice',
          email: 'alice@example.com',
          avatar: 'https://example.com/alice.png',
          url: 'https://github.com/alice',
          firstPR: { num: '5', url: 'https://github.com/acme/repo/pull/5' },
        },
      ],
    })

    const content = await applyContributorsToChangelog(
      '## [1.0.0]\n\n',
      tempDir,
      'https://github.com/acme/repo',
      'abc123',
      'packages/core',
    )

    expect(getContributors).toHaveBeenCalledWith(
      tempDir,
      'abc123',
      'https://github.com/acme/repo',
      'packages/core',
    )
    expect(content).toContain('### New Contributors')
    expect(content).toContain('made their first contribution in [#5]')
    expect(content).toContain('### Contributors')
    expect(content).toContain('alice')
  })

  it('archives major changelogs into a versioned file', async () => {
    const changelogPath = path.join(tempDir, 'CHANGELOG.md')
    await writeFile(changelogPath, '# Changelog\n\n## [1.0.0]\n\nentry\n')

    const footer = await archiveChangelogIfNeeded(
      changelogPath,
      '1.2.3',
      'major',
      false,
    )

    expect(footer).toContain('## Previous Changelogs')
    expect(footer).toContain('CHANGELOG-v1.x.md')

    const archivedPath = path.join(tempDir, 'changelogs', 'CHANGELOG-v1.x.md')
    expect((await stat(archivedPath)).isFile()).toBe(true)
    expect(await readFile(archivedPath, 'utf8')).toContain('## [1.0.0]')
  })
})
