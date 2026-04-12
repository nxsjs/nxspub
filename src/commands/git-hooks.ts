import { loadConfig } from '../utils/load-config'
import { nxsLog } from '../utils/logger'
import { installGitHooks } from './install-git-hooks'

export async function gitHooksCommand(options: { cwd: string; dry?: boolean }) {
  try {
    const config = await loadConfig(options.cwd)
    await installGitHooks(options, config)
  } catch (err: any) {
    nxsLog.error(`Command failed: ${err.message}`)
    process.exit(1)
  }
}
