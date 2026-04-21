import { loadConfig } from '../utils/load-config'
import { withReleaseLock } from '../utils/release-lock'
import { releaseSingle } from './release-single'
import { releaseWorkspace } from './release-workspace'
import type { ReleaseOptions } from './types'

/**
 * @en Published package record produced by release execution.
 * @zh 发布执行产生的已发布包记录。
 */
export interface ReleasePublishedItem {
  /** @en Package name. @zh 包名。 */
  name: string
  /** @en Package version. @zh 包版本。 */
  version: string
}

/**
 * @en Skipped package record produced by release execution.
 * @zh 发布执行产生的跳过包记录。
 */
export interface ReleaseSkippedItem extends ReleasePublishedItem {
  /** @en Skip reason. @zh 跳过原因。 */
  reason: string
}

/**
 * @en Structured release execution summary.
 * @zh 结构化发布执行摘要。
 */
export interface ReleaseExecutionSummary {
  /** @en Published packages. @zh 已发布包列表。 */
  published: ReleasePublishedItem[]
  /** @en Skipped packages. @zh 跳过包列表。 */
  skipped: ReleaseSkippedItem[]
}

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
export async function releaseCommand(
  options: ReleaseOptions,
): Promise<ReleaseExecutionSummary> {
  const { cwd, dry } = options
  const config = await loadConfig(cwd)

  const runReleaseFlow = async (): Promise<ReleaseExecutionSummary> => {
    if (config.workspace) {
      return await releaseWorkspace(options, config)
    }
    return await releaseSingle(options, config)
  }

  if (dry) {
    return await runReleaseFlow()
  }

  return await withReleaseLock(cwd, runReleaseFlow)
}
