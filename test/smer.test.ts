import * as semver from 'semver-es'

it('inc', async () => {
  expect(semver.inc('1.0.0', 'patch')).toBe('1.0.1')
  expect(semver.inc('1.0.0', 'minor')).toBe('1.1.0')
  expect(semver.inc('1.0.0', 'major')).toBe('2.0.0')

  expect(semver.inc('1.0.0', 'prepatch')).toBe('1.0.1-0')
  expect(semver.inc('1.0.0-0', 'prepatch')).toBe('1.0.1-0')
  expect(semver.inc('1.1.0-0', 'prepatch')).toBe('1.1.1-0')
  expect(semver.inc('1.1.0-1', 'prepatch')).toBe('1.1.1-0')

  expect(semver.inc('1.0.0', 'prerelease')).toBe('1.0.1-0')
  expect(semver.inc('1.0.1', 'prerelease')).toBe('1.0.2-0')
  expect(semver.inc('1.0.0-0', 'prerelease')).toBe('1.0.0-1')
  expect(semver.inc('1.0.0-1', 'prerelease')).toBe('1.0.0-2')

  expect(semver.inc('1.0.0', 'release')).toBe(null)
  expect(semver.inc('1.0.0-0', 'release')).toBe('1.0.0')
  expect(semver.inc('1.0.0-1', 'release')).toBe('1.0.0')
})
