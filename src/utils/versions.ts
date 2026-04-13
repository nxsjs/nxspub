import type { BrancheType, NxspubConfig } from '../config'

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
 * @en The determined BrancheType (major, minor, patch) or null if no match
 * @zh 确定的发布类型（大、小、补丁），无匹配则返回 null。
 */
export function determineBumpType(
  commits: { message: string }[],
  config: NxspubConfig,
): BrancheType | null {
  let type: BrancheType | null = null
  for (const { message } of commits) {
    if (config.versioning?.major?.some(re => new RegExp(re).test(message)))
      return 'major'
    if (config.versioning?.minor?.some(re => new RegExp(re).test(message)))
      type = 'minor'
    if (
      config.versioning?.patch?.some(re => new RegExp(re).test(message)) &&
      !type
    )
      type = 'patch'
  }
  return type
}
