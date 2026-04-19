import { DEFAULT_CONFIG } from '../src/config'
import { defineConfig } from '../src/index'
import {
  createLinkProvider,
  parseGitLogRecord,
  resolveBranchType,
} from '../src/utils/git'
import { normalizeRegExp } from '../src/utils/regexp'
import { formatDate } from '../src/utils/date'

describe('core utilities', () => {
  it('defineConfig returns the same config object', () => {
    const config = { branches: { main: 'latest' as const } }
    expect(defineConfig(config)).toBe(config)
  })

  it('normalizes plain strings, regex-like strings, and arrays', () => {
    expect(normalizeRegExp('feat:')).toBeInstanceOf(RegExp)
    expect(normalizeRegExp('/^fix:/i')).toEqual(/^fix:/i)

    const patterns = normalizeRegExp(['feat:', /^fix:/]) as RegExp[]
    expect(patterns).toHaveLength(2)
    expect(patterns[0].test('feat: add feature')).toBe(true)
    expect(patterns[1].test('fix: repair bug')).toBe(true)
  })

  it('formats dates as yyyy-mm-dd', () => {
    expect(formatDate(new Date('2026-04-18T12:30:00.000Z'))).toBe('2026-04-18')
  })

  it('matches branch policies from string patterns', () => {
    expect(resolveBranchType('main', DEFAULT_CONFIG.branches)).toBe('latest')
    expect(
      resolveBranchType('feature/demo', { 'feature/.*': 'preminor' }),
    ).toBe('preminor')
    expect(resolveBranchType('unknown', DEFAULT_CONFIG.branches)).toBeNull()
  })

  it('parses git log records by the first pipe only', () => {
    expect(parseGitLogRecord('abc123|feat: support a | b syntax')).toEqual({
      hash: 'abc123',
      message: 'feat: support a | b syntax',
    })
  })

  it('builds provider links for github and gitlab style remotes', () => {
    const github = createLinkProvider('https://github.com/acme/repo')
    expect(github.user('nyxsola')).toBe('https://github.com/nyxsola')
    expect(github.compare('v1.0.0', 'v1.1.0')).toBe(
      'https://github.com/acme/repo/compare/v1.0.0...v1.1.0',
    )
    expect(github.pr('12')).toBe('https://github.com/acme/repo/pull/12')

    const gitlab = createLinkProvider('https://gitlab.com/acme/repo')
    expect(gitlab.user('@nyxsola')).toBe('https://gitlab.com/nyxsola')
    expect(gitlab.compare('v1.0.0', 'v1.1.0')).toBe(
      'https://gitlab.com/acme/repo/compare/v1.0.0..v1.1.0',
    )
    expect(gitlab.compare('', 'v1.1.0')).toBe(
      'https://gitlab.com/acme/repo/-/tags/v1.1.0',
    )
    expect(gitlab.pr('12')).toBe(
      'https://gitlab.com/acme/repo/merge_requests/12',
    )
  })
})
