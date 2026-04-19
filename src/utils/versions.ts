import type { BranchType, NxspubConfig } from '../config'
import type { PackageTask } from './packages'

/**
 * @en Analyzes commit messages to determine the highest required version bump type
 * @zh 分析提交信息以确定最高级别的版本升级类型
 *
 * @param commits
 * @en List of commit objects containing messages
 * @zh 包含提交信息的对象列表。
 *
 * @param config
 * @en Nxspub configuration containing versioning regex patterns
 * @zh 包含版本匹配正则模式的 Nxspub 配置。
 *
 * @returns
 * @en The determined BranchType (major, minor, patch) or null if no match
 * @zh 确定的发布类型（大、小、补丁），无匹配则返回 null。
 */
export function determineBumpType(
  commits: { message: string }[],
  config: NxspubConfig,
): BranchType | null {
  let type: BranchType | null = null
  for (const { message } of commits) {
    const lines = message
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
    const header = lines[0]
    if (config.versioning?.major?.some(re => new RegExp(re).test(header)))
      return 'major'
    if (config.versioning?.minor?.some(re => new RegExp(re).test(header)))
      type = 'minor'
    if (
      config.versioning?.patch?.some(re => new RegExp(re).test(header)) &&
      !type
    )
      type = 'patch'
  }
  return type
}

/**
 * @en SemVer weight mapping. Higher value = Higher priority
 * @zh SemVer 权重映射。数值越高，优先级越高
 */
export const BUMP_WEIGHTS: Record<BranchType, number> = {
  major: 3,
  premajor: 3,
  minor: 2,
  preminor: 2,
  patch: 1,
  prepatch: 1,
  latest: 1,
}

/**
 * @en Returns the highest bump type from a list of types
 * @zh 从一组类型中返回最高等级的升级类型
 */
export function getMaxBumpType(
  types: (BranchType | null | undefined)[],
): BranchType {
  const validTypes = types.filter((t): t is BranchType => !!t)
  if (validTypes.length === 0) return 'patch'

  return [...validTypes].sort((a, b) => BUMP_WEIGHTS[b] - BUMP_WEIGHTS[a])[0]
}

/**
 * @en Gets the highest bump type among a task's dependencies
 * @zh 获取任务依赖项中最高的变更类型
 */
export function getHighestBumpType(
  task: PackageTask,
  tasks: Map<string, PackageTask>,
): BranchType {
  const depTypes = task.dependencies.map(dep => tasks.get(dep)?.bumpType)
  return getMaxBumpType(depTypes)
}
