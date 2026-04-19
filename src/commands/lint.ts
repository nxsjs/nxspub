import { loadConfig } from '../utils/load-config'
import { abort } from '../utils/errors'
import { nxsLog } from '../utils/logger'
import { lintCommitMsg } from './lint-commit-msg'
import type { LintOptions } from './types'

export async function lintCommand(options: LintOptions) {
  if (options.edit) {
    const config = await loadConfig(options.cwd)
    await lintCommitMsg({ cwd: options.cwd, edit: options.edit }, config)
  } else {
    nxsLog.error('Option --edit <path> is required.')
    abort(1)
  }
}
