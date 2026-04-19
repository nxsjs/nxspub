import { loadConfig } from '../utils/load-config'
import { releaseSingle } from './release-single'
import { releaseWorkspace } from './release-workspace'
import type { ReleaseOptions } from './types'

export async function releaseCommand(options: ReleaseOptions) {
  const { cwd } = options
  const config = await loadConfig(cwd)

  if (config.workspace) {
    await releaseWorkspace(options, config)
  } else {
    await releaseSingle(options, config)
  }
}
