import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { detectPackageManager } from '../src/utils/package-manager'

describe('package manager detection', () => {
  it('uses packageManager from package.json when present', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-pm-'))
    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@9.12.3' }),
    )

    const manager = await detectPackageManager(tempDir)

    expect(manager.name).toBe('pnpm')
    expect(manager.runScript('build')).toEqual({
      bin: 'pnpm',
      args: ['run', 'build'],
    })
  })

  it('detects yarn from lockfile and uses npm publish for releases', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-pm-'))
    await writeFile(path.join(tempDir, 'package.json'), JSON.stringify({}))
    await writeFile(path.join(tempDir, 'yarn.lock'), '')

    const manager = await detectPackageManager(tempDir)

    expect(manager.name).toBe('yarn')
    expect(manager.publish(['--tag', 'next'])).toEqual({
      bin: 'npm',
      args: ['publish', '--tag', 'next'],
    })
    expect(manager.devLintHook()).toBe('yarn run start lint --edit "$1"')
  })

  it('detects npm from lockfile and builds npm-compatible run commands', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-pm-'))
    await writeFile(path.join(tempDir, 'package.json'), JSON.stringify({}))
    await writeFile(path.join(tempDir, 'package-lock.json'), '{}')

    const manager = await detectPackageManager(tempDir)

    expect(manager.name).toBe('npm')
    expect(manager.runScript('start', ['lint', '--edit', '$1'])).toEqual({
      bin: 'npm',
      args: ['run', 'start', '--', 'lint', '--edit', '$1'],
    })
  })
})
