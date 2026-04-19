import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'

/**
 * @en Stable state snapshot for a release branch.
 * @zh 发布分支的稳定状态快照。
 */
export interface StableBranchState {
  /** @en Last known stable root version. @zh 最近一次稳定的根版本号。 */
  rootVersion?: string
  /** @en Last known stable package versions in workspace. @zh 工作区内最近一次稳定的包版本映射。 */
  packageVersions?: Record<string, string>
  /** @en Last update timestamp in ISO format. @zh ISO 格式的最近更新时间。 */
  updatedAt: string
}

/**
 * @en Persisted release state model.
 * @zh 持久化的发布状态模型。
 */
export interface ReleaseState {
  /** @en Stable states grouped by branch name. @zh 按分支名分组的稳定状态。 */
  branches?: Record<string, StableBranchState>
}

function getStateFilePath(cwd: string): string {
  return path.join(cwd, '.nxspub', 'release-state.json')
}

/**
 * @en Load persisted release state from `.nxspub/release-state.json`.
 * @zh 从 `.nxspub/release-state.json` 加载持久化发布状态。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @returns
 * @en Parsed release state object.
 * @zh 解析后的发布状态对象。
 */
export async function loadReleaseState(cwd: string): Promise<ReleaseState> {
  const statePath = getStateFilePath(cwd)
  try {
    const raw = await fs.readFile(statePath, 'utf-8')
    const parsed = JSON.parse(raw) as ReleaseState
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

/**
 * @en Save release state into `.nxspub/release-state.json`.
 * @zh 将发布状态写入 `.nxspub/release-state.json`。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @param state
 * @en Release state object to persist.
 * @zh 需要持久化的发布状态对象。
 *
 * @returns
 * @en Resolves when file write is completed.
 * @zh 文件写入完成后返回。
 */
export async function saveReleaseState(
  cwd: string,
  state: ReleaseState,
): Promise<void> {
  const statePath = getStateFilePath(cwd)
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8')
}

/**
 * @en Update stable state for a specific branch.
 * @zh 更新指定分支的稳定状态。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @param branch
 * @en Branch name used as state key.
 * @zh 用作状态键的分支名。
 *
 * @param payload
 * @en Stable branch snapshot payload.
 * @zh 稳定分支快照内容。
 *
 * @returns
 * @en Resolves when state is updated on disk.
 * @zh 状态更新并落盘后返回。
 */
export async function updateStableBranchState(
  cwd: string,
  branch: string,
  payload: { rootVersion?: string; packageVersions?: Record<string, string> },
): Promise<void> {
  const current = await loadReleaseState(cwd)
  const branches = { ...(current.branches || {}) }
  branches[branch] = {
    rootVersion: payload.rootVersion,
    packageVersions: payload.packageVersions,
    updatedAt: new Date().toISOString(),
  }
  await saveReleaseState(cwd, { ...current, branches })
}

/**
 * @en Choose a safe baseline version from current version and stable hint.
 * @zh 从当前版本与稳定提示版本中选择安全基线版本。
 *
 * @param currentVersion
 * @en Version from package.json.
 * @zh 来自 package.json 的版本号。
 *
 * @param stableHint
 * @en Stable version hint from release state.
 * @zh 来自发布状态的稳定版本提示。
 *
 * @returns
 * @en Selected baseline version.
 * @zh 选出的基线版本。
 */
export function chooseStableBaselineVersion(
  currentVersion: string,
  stableHint?: string,
): string {
  if (!stableHint) return currentVersion

  const currentValid = semver.valid(currentVersion)
  const stableValid = semver.valid(stableHint)

  if (!currentValid) return stableHint
  if (!stableValid) return currentVersion

  if (semver.prerelease(currentVersion)) return stableHint

  return semver.gt(stableHint, currentVersion) ? stableHint : currentVersion
}
