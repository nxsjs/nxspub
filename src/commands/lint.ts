import { loadConfig } from '../utils/load-config'
import { abort } from '../utils/errors'
import { cliLogger } from '../utils/logger'
import { lintCommitMsg } from './lint-commit-msg'
import type { LintOptions } from './types'

export async function lintCommand(options: LintOptions) {
  if (options.edit) {
    const config = await loadConfig(options.cwd)
    await lintCommitMsg({ cwd: options.cwd, edit: options.edit }, config)
  } else {
    cliLogger.error('Option --edit <path> is required.')
    abort(1)
  }
}
