import fs from 'node:fs/promises'
import path from 'node:path'
import type { NxspubConfig } from '../config'
import { abort, toErrorMessage } from '../utils/errors'
import { cliLogger } from '../utils/logger'
import { detectPackageManager } from '../utils/package-manager'
import type { GitHooksOptions } from './types'

/**
 * @en Install executable git hook files from nxspub configuration.
 * @zh 根据 nxspub 配置安装可执行的 Git Hook 文件。
 *
 * @param options
 * @en Git hooks command options.
 * @zh Git Hooks 命令参数。
 *
 * @param config
 * @en Resolved nxspub configuration.
 * @zh 已解析的 nxspub 配置。
 *
 * @returns
 * @en Resolves when all hook files are processed.
 * @zh 所有 Hook 文件处理完成后返回。
 */
export async function installGitHooks(
  options: GitHooksOptions,
  config: NxspubConfig,
) {
  const { cwd, dry } = options
  const gitDir = path.resolve(cwd, '.git')

  const hasGit = await fs
    .access(gitDir)
    .then(() => true)
    .catch(() => false)
  if (!hasGit) {
    cliLogger.error('Git directory not found. Please run "git init" first.')
    abort(1)
  }

  const hooksDir = path.resolve(gitDir, 'hooks')

  await fs.mkdir(hooksDir, { recursive: true })

  const hooksToInstall = config['git-hooks'] || {}

  if (Object.keys(hooksToInstall).length === 0) {
    cliLogger.warn('No hooks defined in config. Skipping installation.')
    return
  }

  cliLogger.step('Installing Git Hooks...')

  if (!hooksToInstall['commit-msg']) {
    const packageManager = await detectPackageManager(cwd)
    const isDevelopment = await fs
      .access(path.resolve(cwd, 'src/cli.ts'))
      .then(() => true)
      .catch(() => false)

    if (isDevelopment) {
      hooksToInstall['commit-msg'] = packageManager.devLintHook()
    } else {
      hooksToInstall['commit-msg'] = 'npx nxspub lint --edit "$1"'
    }
  }

  for (const [name, content] of Object.entries(hooksToInstall)) {
    if (!content) continue

    const hookPath = path.resolve(hooksDir, name)

    const fileContent = `#!/bin/sh\n# nxspub auto-generated\n\n${content}\n`

    cliLogger.item(`Installing ${cliLogger.highlight(name)}...`)

    if (!dry) {
      try {
        await fs.writeFile(hookPath, fileContent, {
          encoding: 'utf-8',
          mode: 0o755,
        })
        await fs.chmod(hookPath, 0o755)
      } catch (err) {
        cliLogger.error(`Failed to install ${name}: ${toErrorMessage(err)}`)
      }
    } else {
      cliLogger.dim(`[Dry Run] Content for ${name}:\n${fileContent}`)
    }
  }

  cliLogger.success('All Git Hooks installed successfully.')
}
