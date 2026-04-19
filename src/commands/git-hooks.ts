import { loadConfig } from '../utils/load-config'
import { abort, toErrorMessage } from '../utils/errors'
import { cliLogger } from '../utils/logger'
import { installGitHooks } from './install-git-hooks'
import type { GitHooksOptions } from './types'

export async function gitHooksCommand(options: GitHooksOptions) {
  try {
    const config = await loadConfig(options.cwd)
    await installGitHooks(options, config)
  } catch (err) {
    cliLogger.error(`Command failed: ${toErrorMessage(err)}`)
    abort(1)
  }
}
