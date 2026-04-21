/**
 * @en Supported deployment provider names.
 * @zh 支持的部署 Provider 名称。
 */
export type DeployProviderName =
  | 'vercel'
  | 'cloudflare'
  | 'onepanel'
  | 'btpanel'
  | 'ssh'
  | 'rancher'
  | 'k8s'
  | 'custom'

/**
 * @en Supported deploy strategy names.
 * @zh 支持的部署策略名称。
 */
export type DeployStrategy = 'rolling' | 'canary' | 'blue-green'

/**
 * @en Deployment artifact descriptor.
 * @zh 部署产物描述。
 */
export interface DeployArtifact {
  /** @en Package or service name. @zh 包或服务名称。 */
  name: string
  /** @en Artifact version. @zh 产物版本。 */
  version: string
  /** @en Optional weak tag reference. @zh 可选弱引用 Tag。 */
  tag?: string
  /** @en Optional immutable digest. @zh 可选不可变摘要。 */
  digest?: string
  /** @en Optional image reference for container workloads. @zh 容器工作负载可选镜像地址。 */
  image?: string
  /** @en Artifact source channel. @zh 产物来源通道。 */
  source: 'release-session' | 'deploy-record' | 'registry' | 'manual'
}

/**
 * @en Risk level used by deploy checks.
 * @zh 部署检查使用的风险等级。
 */
export type DeployRiskLevel = 'blocker' | 'warn' | 'info'

/**
 * @en Deploy check item.
 * @zh 部署检查项。
 */
export interface DeployCheckItem {
  /** @en Stable check id. @zh 稳定检查项 ID。 */
  id: string
  /** @en Whether check passes. @zh 检查是否通过。 */
  ok: boolean
  /** @en Risk level. @zh 风险等级。 */
  level: DeployRiskLevel
  /** @en Human-readable message. @zh 人类可读消息。 */
  message: string
}

/**
 * @en Computed deploy plan.
 * @zh 计算后的部署计划。
 */
export interface DeployPlan {
  /** @en Target environment. @zh 目标环境。 */
  env: string
  /** @en Deploy strategy. @zh 部署策略。 */
  strategy: DeployStrategy
  /** @en Project mode. @zh 项目模式。 */
  mode: 'single' | 'workspace'
  /** @en Branch used for plan. @zh 计划使用的分支。 */
  branch: string
  /** @en Candidate artifacts to deploy. @zh 待部署候选产物。 */
  artifacts: DeployArtifact[]
  /** @en Guard check results. @zh 门禁检查结果。 */
  checks: DeployCheckItem[]
}

/**
 * @en Deploy timeline item.
 * @zh 部署时间线条目。
 */
export interface DeployTimelineItem {
  /** @en Step name. @zh 步骤名称。 */
  step: string
  /** @en Step status. @zh 步骤状态。 */
  status: 'pending' | 'running' | 'success' | 'error'
  /** @en ISO timestamp. @zh ISO 时间戳。 */
  at: string
  /** @en Optional detail message. @zh 可选详细信息。 */
  message?: string
}

/**
 * @en Deploy execution result.
 * @zh 部署执行结果。
 */
export interface DeployResult {
  /** @en Unique deployment id. @zh 唯一部署 ID。 */
  deploymentId: string
  /** @en Overall status. @zh 总体状态。 */
  status: 'success' | 'failed' | 'partial'
  /** @en Deployed artifacts. @zh 已部署产物。 */
  deployed: Array<{ name: string; version: string }>
  /** @en Skipped artifacts. @zh 跳过产物。 */
  skipped: Array<{ name: string; version: string; reason: string }>
  /** @en Failed artifacts. @zh 失败产物。 */
  failed: Array<{ name: string; version: string; reason: string }>
  /** @en Execution timeline. @zh 执行时间线。 */
  timeline: DeployTimelineItem[]
}

/**
 * @en Rollback execution result.
 * @zh 回滚执行结果。
 */
export interface RollbackResult {
  /** @en Current rollback deployment id. @zh 当前回滚执行 ID。 */
  deploymentId: string
  /** @en Target deployment id to rollback to. @zh 回滚目标部署 ID。 */
  rollbackTo: string
  /** @en Overall status. @zh 总体状态。 */
  status: 'success' | 'failed'
  /** @en Execution timeline. @zh 执行时间线。 */
  timeline: DeployTimelineItem[]
}

/**
 * @en Input for provider plan computation.
 * @zh Provider 计划计算输入。
 */
export interface DeployPlanInput {
  cwd: string
  env: string
  strategy: DeployStrategy
  mode: 'single' | 'workspace'
  branch: string
  artifacts: DeployArtifact[]
  dry?: boolean
}

/**
 * @en Input for provider deploy execution.
 * @zh Provider 部署执行输入。
 */
export interface DeployExecuteInput extends DeployPlanInput {
  deploymentId: string
  skipChecks?: boolean
  concurrency?: number
}

/**
 * @en Input for provider rollback execution.
 * @zh Provider 回滚执行输入。
 */
export interface DeployRollbackInput {
  cwd: string
  env: string
  rollbackTo: string
  deploymentId: string
}

/**
 * @en Provider adapter contract.
 * @zh Provider 适配器契约。
 */
export interface DeployProviderAdapter {
  /** @en Provider name. @zh Provider 名称。 */
  name: DeployProviderName
  /** @en Validate provider config/credentials. @zh 校验 provider 配置与凭证。 */
  validate(config: unknown): Promise<void>
  /** @en Build provider-aware deploy plan. @zh 构建 provider 视角部署计划。 */
  plan(input: DeployPlanInput): Promise<DeployPlan>
  /** @en Execute deployment. @zh 执行部署。 */
  execute(input: DeployExecuteInput): Promise<DeployResult>
  /** @en Execute rollback. @zh 执行回滚。 */
  rollback(input: DeployRollbackInput): Promise<RollbackResult>
}

/**
 * @en Stored deploy record payload.
 * @zh 落盘部署记录结构。
 */
export interface DeployRecord {
  deploymentId: string
  env: string
  strategy: DeployStrategy
  branch: string
  status: 'success' | 'failed' | 'partial'
  startedAt: string
  finishedAt: string
  commitSha?: string
  artifacts: DeployArtifact[]
  timeline: DeployTimelineItem[]
  rollbackTo?: string
  result: DeployResult | RollbackResult
}
