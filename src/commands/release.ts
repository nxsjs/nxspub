import { loadConfig } from '../utils/load-config'
import { releaseSingle } from './release-single'
import { releaseWorkspace } from './release-workspace'

export async function releaseCommand(options: any) {
  const { cwd } = options
  const config = await loadConfig(cwd)

  if (config.workspace) {
    await releaseWorkspace(options, config)
  } else {
    await releaseSingle(options, config)
  }
}
