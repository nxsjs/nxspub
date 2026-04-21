import { createHash } from 'node:crypto'
import path from 'node:path'
import type { NxspubConfig } from '../config'
import { NxspubError } from '../utils/errors'
import { getCurrentBranch, runSafe } from '../utils/git'
import { readJSON, scanWorkspacePackages } from '../utils/packages'
import { createDeployProviderAdapter } from './providers'
import {
  readDeployRecord,
  readDeployRecordIndex,
  saveDeployRecord,
} from './records'
import type {
  DeployArtifact,
  DeployCheckItem,
  DeployExecuteInput,
  DeployPlan,
  DeployProviderName,
  DeployRecord,
  DeployResult,
  DeployRollbackInput,
  DeployStrategy,
  RollbackResult,
} from './types'

interface DeployRuntimeConfig {
  enabled?: boolean
  defaultEnvironment?: string
  branchEnvironmentMap?: Record<string, string>
  provider?: {
    name?: string
    config?: Record<string, unknown>
  }
  environments?: Record<
    string,
    {
      strategy?: DeployStrategy
    }
  >
  promotion?: {
    requireSameArtifactDigest?: boolean
    sourceEnvironment?: string
  }
}

export interface DeployCoreInput {
  cwd: string
  env?: string
  strategy?: DeployStrategy
  branch?: string
  dry?: boolean
  plan?: boolean
  rollback?: boolean
  to?: string
  skipChecks?: boolean
  concurrency?: number
  artifactNames?: string[]
}

function now(): string {
  return new Date().toISOString()
}

function toDeployConfig(config: NxspubConfig): DeployRuntimeConfig {
  return (
    (config as NxspubConfig & { deploy?: DeployRuntimeConfig }).deploy || {}
  )
}

async function resolveCommitSha(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await runSafe('git', ['rev-parse', 'HEAD'], { cwd })
    const sha = stdout.trim()
    return sha || undefined
  } catch {
    return undefined
  }
}

async function resolveLatestSuccessfulSourceRecord(
  cwd: string,
  sourceEnvironment: string,
): Promise<DeployRecord | null> {
  const index = await readDeployRecordIndex(cwd)
  for (const item of index.items) {
    if (item.env !== sourceEnvironment) continue
    if (item.status !== 'success') continue
    if (item.rollbackTo) continue
    const record = await readDeployRecord(cwd, item.deploymentId)
    if (!record) continue
    if (record.env !== sourceEnvironment) continue
    if (record.status !== 'success') continue
    if (record.rollbackTo) continue
    return record
  }
  return null
}

async function ensurePromotionConsistency(
  cwd: string,
  env: string,
  artifacts: DeployArtifact[],
  deployConfig: DeployRuntimeConfig,
): Promise<void> {
  const promotionConfig = deployConfig.promotion
  const requireSameArtifactDigest =
    promotionConfig?.requireSameArtifactDigest !== false
  if (!requireSameArtifactDigest) return
  if (env !== 'production') return

  const sourceEnvironment = (
    promotionConfig?.sourceEnvironment || 'staging'
  ).trim()
  if (!sourceEnvironment || sourceEnvironment === env) return

  const sourceRecord = await resolveLatestSuccessfulSourceRecord(
    cwd,
    sourceEnvironment,
  )
  if (!sourceRecord) {
    throw new NxspubError(
      `Promotion blocked: no successful source deployment found in env "${sourceEnvironment}".`,
      3,
      { silent: false },
    )
  }

  const sourceByArtifactName = new Map(
    sourceRecord.artifacts.map(artifact => [artifact.name, artifact]),
  )
  const validationErrors: string[] = []
  for (const artifact of artifacts) {
    const sourceArtifact = sourceByArtifactName.get(artifact.name)
    if (!sourceArtifact) {
      validationErrors.push(`${artifact.name}: missing in source deployment`)
      continue
    }

    const sourceDigest = sourceArtifact.digest?.trim()
    const targetDigest = artifact.digest?.trim()
    if (sourceDigest || targetDigest) {
      if (!sourceDigest || !targetDigest) {
        validationErrors.push(`${artifact.name}: missing digest for comparison`)
        continue
      }
      if (sourceDigest !== targetDigest) {
        validationErrors.push(`${artifact.name}: digest mismatch`)
      }
      continue
    }

    if (sourceArtifact.version !== artifact.version) {
      validationErrors.push(`${artifact.name}: version mismatch`)
    }
  }

  if (validationErrors.length > 0) {
    throw new NxspubError(
      `Promotion blocked against source env "${sourceEnvironment}" (deployment ${sourceRecord.deploymentId}): ${validationErrors.join('; ')}.`,
      3,
      { silent: false },
    )
  }
}

function generateDeploymentId(seed: string): string {
  return createHash('sha1').update(seed).digest('hex').slice(0, 12)
}

async function resolveArtifacts(
  cwd: string,
  config: NxspubConfig,
): Promise<{ mode: 'single' | 'workspace'; artifacts: DeployArtifact[] }> {
  if (config.workspace) {
    const rows = await scanWorkspacePackages(cwd)
    const artifacts = rows
      .filter(row => !row.private)
      .map(
        row =>
          ({
            name: row.name,
            version: row.version,
            source: 'registry',
          }) satisfies DeployArtifact,
      )
    return { mode: 'workspace', artifacts }
  }

  const rootPackage = await readJSON(path.join(cwd, 'package.json'))
  return {
    mode: 'single',
    artifacts: [
      {
        name: String(rootPackage.name || 'unknown'),
        version: String(rootPackage.version || '0.0.0'),
        source: 'registry',
      },
    ],
  }
}

function buildChecks(
  env: string | undefined,
  providerName: string | undefined,
  artifacts: DeployArtifact[],
): DeployCheckItem[] {
  const checks: DeployCheckItem[] = []
  checks.push({
    id: 'env',
    ok: !!env,
    level: env ? 'info' : 'blocker',
    message: env
      ? `Resolved deploy environment: ${env}.`
      : 'Unable to resolve deploy environment.',
  })
  checks.push({
    id: 'provider',
    ok: !!providerName,
    level: providerName ? 'info' : 'blocker',
    message: providerName
      ? `Deploy provider: ${providerName}.`
      : 'Missing deploy.provider.name in config.',
  })
  checks.push({
    id: 'artifacts',
    ok: artifacts.length > 0,
    level: artifacts.length > 0 ? 'info' : 'blocker',
    message:
      artifacts.length > 0
        ? `Resolved ${artifacts.length} artifact(s).`
        : 'No deploy artifact resolved.',
  })
  return checks
}

async function resolvePlan(
  input: DeployCoreInput,
  config: NxspubConfig,
): Promise<{
  plan: DeployPlan
  providerName: DeployProviderName
  providerConfig: Record<string, unknown>
}> {
  const deployConfig = toDeployConfig(config)
  if (deployConfig.enabled === false) {
    throw new NxspubError(
      'Deploy is disabled by config: deploy.enabled=false.',
      3,
      {
        silent: false,
      },
    )
  }

  const branch =
    input.branch || (await getCurrentBranch(input.cwd)) || 'unknown'
  const resolvedEnv =
    input.env ||
    deployConfig.branchEnvironmentMap?.[branch] ||
    deployConfig.defaultEnvironment
  const envConfig = resolvedEnv
    ? deployConfig.environments?.[resolvedEnv]
    : undefined
  const resolvedStrategy =
    input.strategy || envConfig?.strategy || ('rolling' as DeployStrategy)
  const providerNameRaw = deployConfig.provider?.name
  const providerConfig = deployConfig.provider?.config || {}
  const { mode, artifacts } = await resolveArtifacts(input.cwd, config)
  const filteredArtifacts =
    input.artifactNames && input.artifactNames.length > 0
      ? artifacts.filter(item => input.artifactNames!.includes(item.name))
      : artifacts
  const checks = buildChecks(resolvedEnv, providerNameRaw, filteredArtifacts)

  const blockers = checks.filter(item => item.level === 'blocker' && !item.ok)
  if (blockers.length > 0) {
    throw new NxspubError(
      `Deploy plan blocked: ${blockers.map(item => item.message).join(' | ')}`,
      3,
      { silent: false },
    )
  }
  if (resolvedEnv && !deployConfig.environments?.[resolvedEnv]) {
    throw new NxspubError(
      `Deploy environment "${resolvedEnv}" is not configured in deploy.environments.`,
      2,
      { silent: false },
    )
  }
  if (!providerNameRaw) {
    throw new NxspubError('Missing deploy.provider.name.', 2, {
      silent: false,
    })
  }

  return {
    plan: {
      env: resolvedEnv!,
      strategy: resolvedStrategy,
      mode,
      branch,
      artifacts: filteredArtifacts,
      checks,
    },
    providerName: providerNameRaw as DeployProviderName,
    providerConfig,
  }
}

/**
 * @en Build deploy plan from config and runtime options.
 * @zh 根据配置与运行参数构建部署计划。
 */
export async function buildDeployPlan(
  input: DeployCoreInput,
  config: NxspubConfig,
): Promise<DeployPlan> {
  const resolved = await resolvePlan(input, config)
  const provider = createDeployProviderAdapter(
    resolved.providerName,
    resolved.providerConfig,
  )
  await provider.validate(resolved.providerConfig)
  return await provider.plan({
    cwd: input.cwd,
    env: resolved.plan.env,
    strategy: resolved.plan.strategy,
    mode: resolved.plan.mode,
    branch: resolved.plan.branch,
    artifacts: resolved.plan.artifacts,
    dry: input.dry,
  })
}

/**
 * @en Execute deploy flow and persist deploy record.
 * @zh 执行部署流程并持久化部署记录。
 */
export async function runDeploy(
  input: DeployCoreInput,
  config: NxspubConfig,
): Promise<DeployResult> {
  const resolved = await resolvePlan(input, config)
  const deployConfig = toDeployConfig(config)
  await ensurePromotionConsistency(
    input.cwd,
    resolved.plan.env,
    resolved.plan.artifacts,
    deployConfig,
  )
  const provider = createDeployProviderAdapter(
    resolved.providerName,
    resolved.providerConfig,
  )
  await provider.validate(resolved.providerConfig)

  const startedAt = now()
  const commitSha = await resolveCommitSha(input.cwd)
  const deploymentId = generateDeploymentId(
    `${startedAt}:${resolved.plan.env}:${resolved.plan.strategy}:${resolved.plan.branch}:${JSON.stringify(resolved.plan.artifacts)}`,
  )

  const executeInput: DeployExecuteInput = {
    cwd: input.cwd,
    env: resolved.plan.env,
    strategy: resolved.plan.strategy,
    mode: resolved.plan.mode,
    branch: resolved.plan.branch,
    artifacts: resolved.plan.artifacts,
    deploymentId,
    dry: input.dry,
    skipChecks: input.skipChecks,
    concurrency: input.concurrency,
  }
  const result = await provider.execute(executeInput)

  const record: DeployRecord = {
    deploymentId,
    env: resolved.plan.env,
    strategy: resolved.plan.strategy,
    branch: resolved.plan.branch,
    status: result.status,
    startedAt,
    finishedAt: now(),
    commitSha,
    artifacts: resolved.plan.artifacts,
    timeline: result.timeline,
    result,
  }
  await saveDeployRecord(input.cwd, record)
  return result
}

/**
 * @en Execute rollback to an existing successful deployment record.
 * @zh 回滚到现有成功部署记录。
 */
export async function runDeployRollback(
  input: DeployCoreInput,
  config: NxspubConfig,
): Promise<RollbackResult> {
  if (!input.to?.trim()) {
    throw new NxspubError('Rollback requires --to <deploymentId>.', 2, {
      silent: false,
    })
  }
  const targetRecord = await readDeployRecord(input.cwd, input.to.trim())
  if (!targetRecord) {
    throw new NxspubError(`Deploy record not found: ${input.to.trim()}.`, 2, {
      silent: false,
    })
  }
  if (targetRecord.status !== 'success') {
    throw new NxspubError(
      `Rollback target must be a successful deployment: ${input.to.trim()}.`,
      3,
      { silent: false },
    )
  }

  const deployConfig = toDeployConfig(config)
  const providerNameRaw = deployConfig.provider?.name
  if (!providerNameRaw) {
    throw new NxspubError('Missing deploy.provider.name.', 2, {
      silent: false,
    })
  }
  const provider = createDeployProviderAdapter(
    providerNameRaw,
    deployConfig.provider?.config || {},
  )
  await provider.validate(deployConfig.provider?.config || {})

  const deploymentId = generateDeploymentId(
    `${now()}:rollback:${targetRecord.deploymentId}:${targetRecord.env}`,
  )
  const rollbackInput: DeployRollbackInput = {
    cwd: input.cwd,
    env: targetRecord.env,
    rollbackTo: targetRecord.deploymentId,
    deploymentId,
  }
  const result = await provider.rollback(rollbackInput)

  const record: DeployRecord = {
    deploymentId: result.deploymentId,
    env: targetRecord.env,
    strategy: targetRecord.strategy,
    branch: targetRecord.branch,
    status: result.status === 'success' ? 'success' : 'failed',
    startedAt: now(),
    finishedAt: now(),
    artifacts: targetRecord.artifacts,
    timeline: result.timeline,
    rollbackTo: targetRecord.deploymentId,
    result,
  }
  await saveDeployRecord(input.cwd, record)
  return result
}
