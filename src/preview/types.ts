import type { BranchType, WorkspaceMode } from '../config'

/**
 * @en Risk level for pre-release checks.
 * @zh 发布前检查的风险等级。
 */
export type PreviewRiskLevel = 'blocker' | 'warn' | 'info'

/**
 * @en Pre-release check item.
 * @zh 发布前检查项。
 */
export interface PreviewCheckItem {
  /** @en Stable id for frontend rendering. @zh 前端渲染用的稳定标识。 */
  id: string
  /** @en Human-readable title. @zh 人类可读标题。 */
  title: string
  /** @en Detailed message. @zh 详细信息。 */
  message: string
  /** @en Check severity level. @zh 检查严重程度。 */
  level: PreviewRiskLevel
  /** @en Whether this check passes. @zh 该检查是否通过。 */
  ok: boolean
}

/**
 * @en Workspace package preview row.
 * @zh 工作区包预览行。
 */
export interface PreviewPackagePlan {
  /** @en Package name. @zh 包名。 */
  name: string
  /** @en Whether package is private. @zh 是否为私有包。 */
  private: boolean
  /** @en Current package version. @zh 当前包版本。 */
  currentVersion: string
  /** @en Next computed version. @zh 计算后的目标版本。 */
  nextVersion?: string
  /** @en Computed bump type. @zh 计算出的升级类型。 */
  bumpType?: BranchType | null
  /** @en Whether this row is passively bumped. @zh 是否为被动升级。 */
  isPassive?: boolean
  /** @en Passive bump reason list. @zh 被动升级原因列表。 */
  passiveReasons?: string[]
  /** @en Number of triggering commits. @zh 触发提交数量。 */
  commitCount: number
}

/**
 * @en Branch policy status for preview.
 * @zh 预览中的分支策略状态。
 */
export interface PreviewPolicyStatus {
  /** @en Current branch used in preview. @zh 预览使用的当前分支。 */
  branch: string
  /** @en Branch policy from config. @zh 来自配置的分支策略。 */
  policy: BranchType | null
  /** @en Whether policy is configured for branch. @zh 该分支是否配置策略。 */
  ok: boolean
  /** @en Optional policy message. @zh 可选策略说明。 */
  message?: string
}

/**
 * @en Changelog draft import summary item.
 * @zh Changelog 草稿导入汇总项。
 */
export interface PreviewImportedDraft {
  /** @en Source branch. @zh 来源分支。 */
  branch: string
  /** @en Source draft version. @zh 来源草稿版本。 */
  version: string
  /** @en Number of matched items. @zh 命中的条目数量。 */
  count: number
}

/**
 * @en Draft health counters for current target version.
 * @zh 当前目标版本对应的草稿健康计数。
 */
export interface PreviewDraftHealth {
  /** @en Target stable version used for classification. @zh 用于分类的目标稳定版本。 */
  target: string
  /** @en Matching draft count. @zh matching 数量。 */
  matching: number
  /** @en Behind draft count. @zh behind 数量。 */
  behind: number
  /** @en Ahead draft count. @zh ahead 数量。 */
  ahead: number
  /** @en Invalid draft count. @zh invalid 数量。 */
  invalid: number
  /** @en Number of malformed files ignored during read. @zh 读取时忽略的损坏文件数量。 */
  malformedFileCount: number
  /** @en Sample behind draft ids. @zh behind 草稿示例标识。 */
  behindSamples: string[]
}

/**
 * @en Changelog preview payload.
 * @zh Changelog 预览内容。
 */
export interface PreviewChangelog {
  /** @en Rendered markdown preview text. @zh 渲染后的 Markdown 预览文本。 */
  entryPreview: string
  /** @en Imported draft summary rows. @zh 导入草稿汇总行。 */
  importedDrafts: PreviewImportedDraft[]
}

/**
 * @en Context data shared by CLI preview and web APIs.
 * @zh CLI 预览与 Web API 共享的上下文数据。
 */
export interface PreviewContext {
  /** @en Workspace root path. @zh 工作区根目录。 */
  cwd: string
  /** @en Current mode (single/workspace). @zh 当前模式（single/workspace）。 */
  mode: 'single' | 'workspace'
  /** @en Workspace mode when in workspace project. @zh 工作区项目下的 workspace 模式。 */
  workspaceMode?: WorkspaceMode
  /** @en Detected package manager name. @zh 检测到的包管理器名称。 */
  packageManager: string
  /** @en Current git branch name if available. @zh 当前 Git 分支名（若可用）。 */
  currentBranch: string
  /** @en Branches configured in nxspub config. @zh nxspub 配置中的分支集合。 */
  availableBranches: string[]
}

/**
 * @en Unified preview result model.
 * @zh 统一预览结果模型。
 */
export interface PreviewResult {
  /** @en Project mode. @zh 项目模式。 */
  mode: 'single' | 'workspace'
  /** @en Branch used for preview. @zh 预览使用的分支。 */
  branch: string
  /** @en Policy resolution status. @zh 策略解析状态。 */
  policy: PreviewPolicyStatus
  /** @en Current root version. @zh 当前根版本。 */
  currentVersion?: string
  /** @en Target root version. @zh 目标根版本。 */
  targetVersion?: string
  /** @en Total commit count considered by preview. @zh 预览纳入的提交总数。 */
  commitCount: number
  /** @en Number of public packages planned for release. @zh 计划发布的公开包数量。 */
  releasePackageCount: number
  /** @en Workspace package plan rows. @zh 工作区包计划行。 */
  packages?: PreviewPackagePlan[]
  /** @en Optional changelog preview block. @zh 可选 changelog 预览区块。 */
  changelog?: PreviewChangelog
  /** @en Optional draft health summary. @zh 可选草稿健康摘要。 */
  draftHealth?: PreviewDraftHealth
  /** @en Optional check list. @zh 可选检查项列表。 */
  checks?: PreviewCheckItem[]
}

/**
 * @en Draft prune request payload.
 * @zh 草稿清理请求参数。
 */
export interface DraftPruneRequest {
  /** @en Target stable version. @zh 目标稳定版本。 */
  target: string
  /** @en Current supported scope (behind only). @zh 当前支持范围（仅 behind）。 */
  only: 'behind'
  /** @en Preview deletions without applying changes. @zh 仅预览删除结果，不实际删除。 */
  dryRun?: boolean
}

/**
 * @en Draft prune result payload.
 * @zh 草稿清理结果。
 */
export interface DraftPruneResult {
  /** @en Number of pruned files. @zh 已清理文件数量。 */
  prunedCount: number
  /** @en Remaining file count after prune. @zh 清理后剩余文件数量。 */
  remaining: number
  /** @en File path list affected by prune call. @zh 本次清理影响的文件列表。 */
  affectedFiles: string[]
}
