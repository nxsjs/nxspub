import { loadConfig } from '../utils/load-config'
import { withReleaseLock } from '../utils/release-lock'
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
  const { cwd, dry } = options
  const config = await loadConfig(cwd)

  const runReleaseFlow = async () => {
    if (config.workspace) {
      await releaseWorkspace(options, config)
    } else {
      await releaseSingle(options, config)
    }
  }

  if (dry) {
    await runReleaseFlow()
  } else {
    await withReleaseLock(cwd, runReleaseFlow)
  }
}
