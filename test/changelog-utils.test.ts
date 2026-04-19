import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
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
  analyzeDraftsForTargetVersion,
  applyContributorsToChangelog,
  archiveChangelogIfNeeded,
  canWriteChangelogOnBranch,
  cleanupExistingEntry,
  extractShortCommitHashes,
  filterDraftsForTargetVersion,
  parseCommit,
  readChangelogDrafts,
  removeChangelogDraft,
  writeChangelogDraft,
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

  it('evaluates changelog write branch allowlist correctly', () => {
    expect(canWriteChangelogOnBranch(undefined, 'main')).toBe(true)
    expect(canWriteChangelogOnBranch([], 'main')).toBe(false)
    expect(canWriteChangelogOnBranch(['main', 'master'], 'main')).toBe(true)
    expect(canWriteChangelogOnBranch(['main', 'master'], 'alpha')).toBe(false)
    expect(canWriteChangelogOnBranch(['main'], undefined)).toBe(false)
  })

  it('writes, reads, filters and removes changelog drafts', async () => {
    const draftAPath = await writeChangelogDraft(tempDir, {
      schemaVersion: 1,
      branch: 'alpha',
      version: '1.3.0-alpha.3',
      generatedAt: '2026-04-18T00:00:00.000Z',
      items: [
        {
          label: 'Features',
          hash: '1234567890abcdef1234567890abcdef12345678',
          content: '* alpha feature',
        },
      ],
    })
    await writeChangelogDraft(tempDir, {
      schemaVersion: 1,
      branch: 'beta',
      version: '2.0.0-beta.1',
      generatedAt: '2026-04-18T00:00:00.000Z',
      items: [
        {
          label: 'Features',
          hash: 'abcdef1234567890abcdef1234567890abcdef12',
          content: '* beta feature',
        },
      ],
    })

    const allDrafts = await readChangelogDrafts(tempDir)
    expect(allDrafts).toHaveLength(2)

    const targetDrafts = filterDraftsForTargetVersion(allDrafts, '1.3.0')
    expect(targetDrafts).toHaveLength(1)
    expect(targetDrafts[0].draft.branch).toBe('alpha')

    await removeChangelogDraft(draftAPath)
    const afterRemove = await readChangelogDrafts(tempDir)
    expect(afterRemove).toHaveLength(1)
  })

  it('ignores malformed draft items and classifies remaining drafts by target version', async () => {
    await mkdir(path.join(tempDir, '.nxspub', 'changelog-drafts', 'alpha'), {
      recursive: true,
    })
    await writeFile(
      path.join(
        tempDir,
        '.nxspub',
        'changelog-drafts',
        'alpha',
        '1.3.0-alpha.0.json',
      ),
      JSON.stringify(
        {
          schemaVersion: 1,
          branch: 'alpha',
          version: '1.3.0-alpha.0',
          generatedAt: '2026-04-18T00:00:00.000Z',
          items: [
            { label: 'Features', hash: 'abcdef123', content: '* good item' },
            { label: 'Features', hash: 123, content: '* broken item' },
          ],
        },
        null,
        2,
      ),
    )

    await writeChangelogDraft(tempDir, {
      schemaVersion: 1,
      branch: 'beta',
      version: '1.2.0-beta.0',
      generatedAt: '2026-04-18T00:00:00.000Z',
      items: [{ label: 'Bug Fixes', hash: '123456789', content: '* fix item' }],
    })

    const drafts = await readChangelogDrafts(tempDir)
    expect(drafts).toHaveLength(2)
    expect(drafts[0].draft.items).toHaveLength(1)

    const analysis = analyzeDraftsForTargetVersion(drafts, '1.3.0')
    expect(analysis.matching).toHaveLength(1)
    expect(analysis.behind).toHaveLength(1)
    expect(analysis.ahead).toHaveLength(0)
    expect(analysis.invalid).toHaveLength(0)
  })

  it('extracts short commit hashes from changelog links', () => {
    const content =
      '* feat ([abc1234](https://github.com/acme/repo/commit/abc1234))\n' +
      '* fix ([def5678](https://github.com/acme/repo/commit/def5678))'
    const hashes = extractShortCommitHashes(content)
    expect(hashes.has('abc1234')).toBe(true)
    expect(hashes.has('def5678')).toBe(true)
  })
})
