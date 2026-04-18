import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, vi } from 'vitest'
import {
  loadPackageJSON,
  savePackageJSON,
  scanWorkspacePackages,
  topologicalSort,
  writeJSON,
} from '../src/utils/packages'
import type { PackageTask } from '../src/utils/packages'

function makeTask(name: string, dependencies: string[] = []): PackageTask {
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
    bumpType: null,
    isPassive: false,
  }
}

describe('package utilities', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-packages-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockExit() {
    return vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit:${code}`)
      })
  }

  it('preserves indentation when rewriting json files', async () => {
    const file = path.join(tempDir, 'package.json')
    await writeFile(file, '{\n\t"name": "demo"\n}\n')

    await writeJSON(file, { name: 'demo', version: '1.0.0' })

    const content = await readFile(file, 'utf8')
    expect(content).toContain('\t"version": "1.0.0"')
  })

  it('loads and saves package metadata', async () => {
    const file = path.join(tempDir, 'package.json')
    await writeFile(file, JSON.stringify({ name: 'demo', version: '1.0.0' }))

    const pkg = await loadPackageJSON('package.json', tempDir)
    expect(pkg.name).toBe('demo')

    pkg.raw.version = '1.1.0'
    await savePackageJSON(pkg)

    expect(await readFile(file, 'utf8')).toContain('"version": "1.1.0"')
  })

  it('scans pnpm workspace packages and collects dependency names', async () => {
    await writeFile(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n',
    )
    await writeFile(path.join(tempDir, 'package.json'), JSON.stringify({}))
    await mkdir(path.join(tempDir, 'packages', 'core'), { recursive: true })
    await mkdir(path.join(tempDir, 'packages', 'app'), { recursive: true })
    await writeFile(
      path.join(tempDir, 'packages', 'core', 'package.json'),
      JSON.stringify({ name: '@acme/core', version: '1.0.0' }),
    )
    await writeFile(
      path.join(tempDir, 'packages', 'app', 'package.json'),
      JSON.stringify({
        name: '@acme/app',
        version: '1.0.1',
        dependencies: { '@acme/core': '^1.0.0' },
        peerDependencies: { react: '^19.0.0' },
      }),
    )

    const results = await scanWorkspacePackages(tempDir)
    const app = results.find(pkg => pkg.name === '@acme/app')

    expect(results).toHaveLength(2)
    expect(app?.dependencies).toEqual(['@acme/core', 'react'])
  })

  it('falls back to package.json workspaces when pnpm-workspace is absent', async () => {
    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ workspaces: ['modules/*'] }),
    )
    await mkdir(path.join(tempDir, 'modules', 'demo'), { recursive: true })
    await writeFile(
      path.join(tempDir, 'modules', 'demo', 'package.json'),
      JSON.stringify({ name: 'demo', version: '1.0.0' }),
    )

    const results = await scanWorkspacePackages(tempDir)
    expect(results.map(pkg => pkg.name)).toEqual(['demo'])
  })

  it('sorts package tasks topologically', () => {
    const tasks = new Map<string, PackageTask>([
      ['core', makeTask('core')],
      ['ui', makeTask('ui', ['core'])],
      ['app', makeTask('app', ['ui'])],
    ])

    expect(topologicalSort(tasks)).toEqual(['core', 'ui', 'app'])
  })

  it('aborts on circular dependencies', () => {
    const exitSpy = mockExit()

    const tasks = new Map<string, PackageTask>([
      ['a', makeTask('a', ['b'])],
      ['b', makeTask('b', ['a'])],
    ])

    expect(() => topologicalSort(tasks)).toThrow('process.exit:1')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
