import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from '../src/utils/load-config'

describe('loadConfig', () => {
  it('merges file config, package config, and defaults', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-config-'))

    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        nxspub: {
          'git-hooks': {
            'pre-commit': 'pnpm lint',
          },
        },
      }),
    )

    await writeFile(
      path.join(tempDir, 'nxspub.config.ts'),
      ['export default {', '  branches: { alpha: "preminor" },', '}'].join(
        '\n',
      ),
    )

    const config = await loadConfig(tempDir)

    expect(config.branches?.alpha).toBe('preminor')
    expect(config.branches?.main).toBe('latest')
    expect(config['git-hooks']?.['pre-commit']).toBe('pnpm lint')
    expect(config.versioning?.patch).toBeDefined()
  })

  it('falls back to defaults when no project config exists', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-defaults-'))
    const config = await loadConfig(tempDir)

    expect(config.branches?.main).toBe('latest')
    expect(config.lint?.['commit-msg']).toBeDefined()
  })
})
