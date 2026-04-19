import { loadConfig } from '../utils/load-config'
import { releaseSingle } from './release-single'
import { releaseWorkspace } from './release-workspace'
import type { ReleaseOptions } from './types'

/**
 * @en Route release execution to single-package or workspace mode.
 * @zh 将发布流程分发到单包模式或工作区模式执行。
 *
 * @param options
 * @en Release command options.
 * @zh 发布命令参数。
 *
 * @returns
 * @en Resolves when release command is completed.
 * @zh 发布命令完成后返回。
 */
export async function releaseCommand(options: ReleaseOptions) {
  const { cwd } = options
  const config = await loadConfig(cwd)

  if (config.workspace) {
    await releaseWorkspace(options, config)
  } else {
    await releaseSingle(options, config)
  }
}
