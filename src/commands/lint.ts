import { loadConfig } from '../utils/load-config'
import { abort } from '../utils/errors'
import { cliLogger } from '../utils/logger'
import { lintCommitMsg } from './lint-commit-msg'
import type { LintOptions } from './types'

/**
 * @en Run commit message lint command.
 * @zh 执行提交信息校验命令。
 *
 * @param options
 * @en Lint command options.
 * @zh 校验命令参数。
 *
 * @returns
 * @en Resolves when lint command is completed.
 * @zh 校验命令完成后返回。
 */
export async function lintCommand(options: LintOptions) {
  if (options.edit) {
    const config = await loadConfig(options.cwd)
    await lintCommitMsg({ cwd: options.cwd, edit: options.edit }, config)
  } else {
    cliLogger.error('Option --edit <path> is required.')
    abort(1)
  }
}
