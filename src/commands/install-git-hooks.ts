import fs from 'node:fs/promises'
import path from 'node:path'
import type { NxspubConfig } from '../config'
import { nxsLog } from '../utils/logger'

export async function installGitHooks(
  options: { cwd: string; dry?: boolean },
  config: NxspubConfig,
) {
  const { cwd, dry } = options
  const gitDir = path.resolve(cwd, '.git')

  const hasGit = await fs
    .access(gitDir)
    .then(() => true)
    .catch(() => false)
  if (!hasGit) {
    nxsLog.error('Git directory not found. Please run "git init" first.')
    process.exit(1)
  }

  const hooksDir = path.resolve(gitDir, 'hooks')

  await fs.mkdir(hooksDir, { recursive: true })

  const hooksToInstall = config['git-hooks'] || {}

  if (Object.keys(hooksToInstall).length === 0) {
    nxsLog.warn('No hooks defined in config. Skipping installation.')
    return
  }

  nxsLog.step('Installing Git Hooks...')

  if (!hooksToInstall['commit-msg']) {
    const isSelfDev = await fs
      .access(path.resolve(cwd, 'bin/nxspub.mjs'))
      .then(() => true)
      .catch(() => false)

    if (isSelfDev) {
      hooksToInstall['commit-msg'] = 'pnpm run start lint --edit "$1"'
    } else {
      hooksToInstall['commit-msg'] = 'npx nxspub lint --edit "$1"'
    }
  }

  for (const [name, content] of Object.entries(hooksToInstall)) {
    if (!content) continue

    const hookPath = path.resolve(hooksDir, name)

    const fileContent = `#!/bin/sh\n# nxspub auto-generated\n\n${content}\n`

    nxsLog.item(`Installing ${nxsLog.highlight(name)}...`)

    if (!dry) {
      try {
        await fs.writeFile(hookPath, fileContent, {
          encoding: 'utf-8',
          mode: 0o755,
        })
        await fs.chmod(hookPath, 0o755)
      } catch (err: any) {
        nxsLog.error(`Failed to install ${name}: ${err.message}`)
      }
    } else {
      nxsLog.dim(`[Dry Run] Content for ${name}:\n${fileContent}`)
    }
  }

  nxsLog.success('All Git Hooks installed successfully.')
}
