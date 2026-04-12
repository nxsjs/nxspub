import { nxsLog } from '../utils/logger'
import { lintCommitMsg } from './lint-commit-msg'

export async function lintCommand(options: any) {
  if (options.edit) {
    // const config = await loadConfig(options.cwd)
    await lintCommitMsg(options)
  } else {
    nxsLog.error('Option --edit <path> is required.')
    process.exit(1)
  }
}
