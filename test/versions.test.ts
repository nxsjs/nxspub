import { DEFAULT_CONFIG } from '../src/config'
import {
  determineBumpType,
  getHighestBumpType,
  getMaxBumpType,
} from '../src/utils/versions'
import type { PackageTask } from '../src/utils/packages'

function makeTask(
  name: string,
  dependencies: string[] = [],
  bumpType: PackageTask['bumpType'] = null,
): PackageTask {
  return {
    name,
    version: '1.0.0',
    private: false,
    dir: `/tmp/${name}`,
    relativeDir: name,
    pkgPath: `/tmp/${name}/package.json`,
    changelogPath: `/tmp/${name}/CHANGELOG.md`,
    archiveDir: `/tmp/${name}/changelogs`,
    dependencies,
    commits: [],
    bumpType,
    isPassive: false,
  }
}

describe('version helpers', () => {
  it('detects the highest bump type from commits', () => {
    expect(
      determineBumpType(
        [
          { message: 'fix(core): patch change' },
          { message: 'feat(ui): minor change' },
        ],
        DEFAULT_CONFIG,
      ),
    ).toBe('minor')

    expect(
      determineBumpType(
        [{ message: 'feat(api)!: breaking change' }],
        DEFAULT_CONFIG,
      ),
    ).toBe('major')
  })

  it('returns null when no commit matches configured patterns', () => {
    expect(
      determineBumpType([{ message: 'docs: update readme' }], DEFAULT_CONFIG),
    ).toBeNull()
  })

  it('falls back to patch when no bump types are present', () => {
    expect(getMaxBumpType([null, undefined])).toBe('patch')
  })

  it('returns the highest bump type from a list', () => {
    expect(getMaxBumpType(['patch', 'major', 'minor'])).toBe('major')
  })

  it('derives the highest dependency bump for a package task', () => {
    const tasks = new Map<string, PackageTask>([
      ['core', makeTask('core', [], 'minor')],
      ['ui', makeTask('ui', [], 'patch')],
      ['app', makeTask('app', ['core', 'ui'])],
    ])

    expect(getHighestBumpType(tasks.get('app')!, tasks)).toBe('minor')
  })
})
