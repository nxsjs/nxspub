import { loadConfig } from '../utils/load-config'
import { abort, toErrorMessage } from '../utils/errors'
import { cliLogger } from '../utils/logger'
import { installGitHooks } from './install-git-hooks'
import type { GitHooksOptions } from './types'

/**
 * @en Install configured git hooks for the current project.
 * @zh 为当前项目安装已配置的 Git Hooks。
 *
 * @param options
 * @en Git hooks command options.
 * @zh Git Hooks 命令参数。
 *
 * @returns
 * @en Resolves when hook installation command is completed.
 * @zh Hook 安装命令完成后返回。
 */
export async function gitHooksCommand(options: GitHooksOptions) {
  try {
    const config = await loadConfig(options.cwd)
    await installGitHooks(options, config)
  } catch (err) {
    cliLogger.error(`Command failed: ${toErrorMessage(err)}`)
    abort(1)
  }
}
