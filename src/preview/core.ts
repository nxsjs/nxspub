import path from 'node:path'
import * as semver from 'semver-es'
import type { BranchType, NxspubConfig, WorkspaceMode } from '../config'
import {
  analyzeDraftsForTargetVersion,
  parseCommit,
  readChangelogDraftsWithReport,
  removeChangelogDraft,
} from '../utils/changelog'
import {
  createLinkProvider,
  getCurrentBranch,
  getLastReleaseCommit,
  getPackageCommits,
  getRawCommits,
  getRepoUrl,
  hasLocalTag,
  hasRemoteTag,
  resolveBranchPolicy,
  runSafe,
} from '../utils/git'
import { loadConfig } from '../utils/load-config'
import { checkVersionExists } from '../utils/npm'
import { detectPackageManager } from '../utils/package-manager'
import {
  readJSON,
  scanWorkspacePackages,
  topologicalSort,
} from '../utils/packages'
import {
  chooseStableBaselineVersion,
  loadReleaseState,
} from '../utils/release-state'
import {
  determineBumpType,
  getHighestBumpType,
  getMaxBumpType,
} from '../utils/versions'
import type {
  DraftPruneRequest,
  DraftPruneResult,
  PreviewCheckItem,
  PreviewContext,
  PreviewDraftHealth,
  PreviewImportedDraft,
  PreviewPackagePlan,
  PreviewPolicyStatus,
  PreviewResult,
} from './types'

interface BuildPreviewOptions {
  cwd: string
  branch?: string
  includeChangelog?: boolean
  includeChecks?: boolean
}

interface WorkspaceTask {
  name: string
  version: string
  private: boolean
  relativeDir: string
  dependencies: string[]
  commits: { hash: string; message: string }[]
  bumpType: BranchType | null
  isPassive: boolean
  passiveReasons?: string[]
  nextVersion?: string
}

async function checkRegistryWithTimeout(
  name: string,
  version: string,
  timeoutMs = 5000,
): Promise<boolean> {
  return await Promise.race([
    checkVersionExists(name, version),
    new Promise<boolean>(resolve => {
      setTimeout(() => resolve(false), timeoutMs)
    }),
  ])
}

function getCoreVersion(version: string): string {
  const index = version.indexOf('-')
  return index === -1 ? version : version.slice(0, index)
}

function computePolicyStatus(
  branch: string,
  config: NxspubConfig,
): PreviewPolicyStatus {
  const policy = resolveBranchPolicy(branch, config.branches)
  if (!policy) {
    return {
      branch,
      policy: null,
      ok: false,
      message: `Branch "${branch}" is not configured in branches policy.`,
    }
  }

  return {
    branch,
    policy,
    ok: true,
  }
}

function computeVersionByPolicy(
  currentVersion: string,
  bumpType: BranchType,
  policy: BranchType,
  branch: string,
): string {
  if (policy.startsWith('pre')) {
    const prereleaseIdentifier = branch.replace(/\//g, '-')
    const prereleaseTokens = semver.prerelease(currentVersion)
    const currentIdentifier =
      prereleaseTokens && typeof prereleaseTokens[0] === 'string'
        ? prereleaseTokens[0]
        : undefined
    const continueCurrentChannel =
      !!prereleaseTokens && currentIdentifier === prereleaseIdentifier

    return semver.inc(
      currentVersion,
      continueCurrentChannel ? 'prerelease' : (policy as semver.ReleaseType),
      prereleaseIdentifier,
    )!
  }

  return semver.inc(currentVersion, bumpType as semver.ReleaseType)!
}

function collectDraftImportSummary(
  records: { draft: { branch: string; version: string; items: unknown[] } }[],
): PreviewImportedDraft[] {
  const summaryMap = new Map<string, PreviewImportedDraft>()
  for (const record of records) {
    const key = `${record.draft.branch}@@${record.draft.version}`
    const hit = summaryMap.get(key)
    if (hit) {
      hit.count += record.draft.items.length
      continue
    }
    summaryMap.set(key, {
      branch: record.draft.branch,
      version: record.draft.version,
      count: record.draft.items.length,
    })
  }
  return Array.from(summaryMap.values()).sort((a, b) =>
    `${a.branch}@${a.version}`.localeCompare(`${b.branch}@${b.version}`),
  )
}

function renderSingleChangelogPreview(
  commits: { hash: string; message: string }[],
  config: NxspubConfig,
  repoUrl: string,
): string {
  const links = createLinkProvider(repoUrl)
  const groups: Record<string, string[]> = {}

  for (const { hash, message } of commits) {
    const parsed = parseCommit(message, repoUrl)
    if (!parsed) continue

    const label = config.changelog?.labels?.[parsed.type]
    if (!label) continue
    if (!groups[label]) groups[label] = []

    const commitLink = `[${hash.slice(0, 7)}](${links.commit(hash)})`
    const scopeText = parsed.scope ? `**${parsed.scope}:** ` : ''
    const breakingTag = parsed.isBreaking ? `**[BREAKING CHANGE]** ` : ''
    const prsText =
      parsed.prLinks.length > 0 ? ` ${parsed.prLinks.join(' ')}` : ''
    const closesSuffix =
      parsed.linkedIssues.length > 0
        ? ` (closes ${parsed.linkedIssues.join(', ')})`
        : ''

    let row = `* ${scopeText}${breakingTag}${parsed.subject}${prsText} (${commitLink})${closesSuffix}`

    if (parsed.bodyLines.length > 0) {
      row += `\n  > ${parsed.bodyLines.join('\n  \n  > ')}`
    }
    if (parsed.breakingDetail) {
      row += `\n  > **BREAKING CHANGE:** ${parsed.breakingDetail.replace(/\n/g, '\n  > ')}`
    }

    groups[label].push(row)
  }

  const rows: string[] = []
  for (const [label, lines] of Object.entries(groups)) {
    rows.push(`### ${label}`)
    rows.push(lines.join('\n'))
    rows.push('')
  }
  return rows.join('\n').trim()
}

function renderWorkspaceRootPreview(
  tasks: WorkspaceTask[],
  config: NxspubConfig,
  repoUrl: string,
): string {
  const links = createLinkProvider(repoUrl)
  const packageEntries: string[] = []

  for (const task of tasks) {
    if (!task.nextVersion || task.nextVersion === task.version) continue

    const groups: Record<string, string[]> = {}
    if (task.isPassive && task.passiveReasons?.length) {
      const depsLabel = config.changelog?.labels?.deps || 'Dependencies'
      groups[depsLabel] = [
        `* **internal:** dependency propagation (${task.passiveReasons.join(', ')})`,
      ]
    }

    for (const commit of task.commits) {
      const parsed = parseCommit(commit.message, repoUrl)
      if (!parsed) continue
      const label = config.changelog?.labels?.[parsed.type]
      if (!label) continue
      if (!groups[label]) groups[label] = []

      const commitLink = `[${commit.hash.slice(0, 7)}](${links.commit(commit.hash)})`
      const scopeText = parsed.scope ? `**${parsed.scope}:** ` : ''
      const breakingTag = parsed.isBreaking ? `**[BREAKING CHANGE]** ` : ''
      groups[label].push(
        `* ${scopeText}${breakingTag}${parsed.subject} (${commitLink})`,
      )
    }

    const sectionRows: string[] = []
    for (const [label, lines] of Object.entries(groups)) {
      sectionRows.push(`- **${label}**`)
      for (const line of lines) {
        sectionRows.push(`  ${line.replace(/^\* /, '- ')}`)
      }
    }

    if (sectionRows.length > 0) {
      packageEntries.push(
        `### ${task.name}@${task.nextVersion}\n${sectionRows.join('\n')}`,
      )
    }
  }

  return packageEntries.join('\n\n').trim()
}

function applyWorkspacePassiveChanges(
  tasks: Map<string, WorkspaceTask>,
  passivePolicy: 'patch' | 'follow' | 'none',
) {
  if (passivePolicy === 'none') return

  const sortedNames = topologicalSort(tasks)
  for (const name of sortedNames) {
    const task = tasks.get(name)
    if (!task || task.bumpType) continue

    const changedDeps = task.dependencies
      .map(depName => tasks.get(depName))
      .filter(dep => dep?.bumpType || dep?.isPassive)

    if (changedDeps.length === 0) continue

    task.isPassive = true
    task.bumpType =
      passivePolicy === 'follow'
        ? getHighestBumpType(task as never, tasks as never)
        : 'patch'
    task.passiveReasons = changedDeps.map(
      dep => `${dep!.name}@${dep!.nextVersion || dep!.version}`,
    )
  }
}

function assignWorkspaceNextVersions(
  tasks: Map<string, WorkspaceTask>,
  policy: BranchType,
  branch: string,
  mode: WorkspaceMode,
): string {
  const maxCurrentVersion = Array.from(tasks.values())
    .map(task => task.version)
    .sort(semver.rcompare)[0]
  const highestBump = getMaxBumpType(
    Array.from(tasks.values()).map(task => task.bumpType),
  )
  const globalNextVersion = computeVersionByPolicy(
    maxCurrentVersion,
    highestBump,
    policy,
    branch,
  )

  if (mode === 'locked') {
    for (const task of tasks.values()) {
      task.nextVersion = globalNextVersion
    }
    return globalNextVersion
  }

  for (const task of tasks.values()) {
    if (!task.bumpType) continue
    task.nextVersion = computeVersionByPolicy(
      task.version,
      task.bumpType,
      policy,
      branch,
    )
  }
  return globalNextVersion
}

async function buildDraftHealth(
  cwd: string,
  targetVersion: string,
): Promise<{
  draftHealth: PreviewDraftHealth
  importedDrafts: PreviewImportedDraft[]
}> {
  const report = await readChangelogDraftsWithReport(cwd)
  const analysis = analyzeDraftsForTargetVersion(report.records, targetVersion)

  return {
    draftHealth: {
      target: targetVersion,
      matching: analysis.matching.length,
      behind: analysis.behind.length,
      ahead: analysis.ahead.length,
      invalid: analysis.invalid.length,
      malformedFileCount: report.malformedFileCount,
      behindSamples: analysis.behind
        .slice(0, 5)
        .map(record => `${record.draft.branch}@${record.draft.version}`),
    },
    importedDrafts: collectDraftImportSummary(analysis.matching),
  }
}

async function buildSinglePreview(options: {
  cwd: string
  branch: string
  config: NxspubConfig
  includeChangelog?: boolean
}): Promise<PreviewResult> {
  const { cwd, branch, config, includeChangelog } = options
  const policyStatus = computePolicyStatus(branch, config)

  const packageJson = await readJSON(path.join(cwd, 'package.json'))
  const stableState =
    policyStatus.policy === 'latest'
      ? (await loadReleaseState(cwd)).branches?.[branch]
      : undefined
  const currentVersion = chooseStableBaselineVersion(
    packageJson.version,
    stableState?.rootVersion,
  )

  const lastRelease = await getLastReleaseCommit(cwd)
  const commits = await getRawCommits(cwd, lastRelease?.hash)
  const bumpType = determineBumpType(commits, config)

  let targetVersion = currentVersion
  if (bumpType && policyStatus.policy) {
    targetVersion = computeVersionByPolicy(
      currentVersion,
      bumpType,
      policyStatus.policy,
      branch,
    )
  } else if (
    !bumpType &&
    policyStatus.policy &&
    !policyStatus.policy.startsWith('pre') &&
    semver.prerelease(currentVersion)
  ) {
    targetVersion = computeVersionByPolicy(
      currentVersion,
      'patch',
      'patch',
      branch,
    )
  }

  const result: PreviewResult = {
    mode: 'single',
    branch,
    policy: policyStatus,
    currentVersion,
    targetVersion,
    commitCount: commits.length,
    releasePackageCount: 1,
  }

  if (includeChangelog) {
    const repoUrl = await getRepoUrl(cwd)
    const targetCoreVersion = getCoreVersion(targetVersion)
    const { draftHealth, importedDrafts } = await buildDraftHealth(
      cwd,
      targetCoreVersion,
    )

    result.draftHealth = draftHealth
    result.changelog = {
      entryPreview: renderSingleChangelogPreview(commits, config, repoUrl),
      importedDrafts,
    }
  }

  return result
}

async function buildWorkspacePreview(options: {
  cwd: string
  branch: string
  config: NxspubConfig
  includeChangelog?: boolean
}): Promise<PreviewResult> {
  const { cwd, branch, config, includeChangelog } = options
  const policyStatus = computePolicyStatus(branch, config)
  const workspaceMode = config.workspace?.mode || 'locked'
  const passivePolicy = config.workspace?.passive ?? 'patch'

  const rootPackage = await readJSON(path.join(cwd, 'package.json'))
  const workspacePackages = await scanWorkspacePackages(cwd)
  const lastRelease = await getLastReleaseCommit(cwd)
  const stableState =
    policyStatus.policy === 'latest'
      ? (await loadReleaseState(cwd)).branches?.[branch]
      : undefined

  const tasks = new Map<string, WorkspaceTask>()
  for (const info of workspacePackages) {
    const normalizedVersion = chooseStableBaselineVersion(
      info.version,
      stableState?.packageVersions?.[info.name],
    )
    const commits = await getPackageCommits(
      cwd,
      info.relativeDir,
      lastRelease?.hash,
    )
    tasks.set(info.name, {
      name: info.name,
      version: normalizedVersion,
      private: info.private,
      relativeDir: info.relativeDir,
      dependencies: info.dependencies,
      commits,
      bumpType: determineBumpType(commits, config),
      isPassive: false,
    })
  }

  applyWorkspacePassiveChanges(tasks, passivePolicy)

  const changedTasks = Array.from(tasks.values()).filter(
    task => task.bumpType || task.isPassive,
  )
  const highestBump = getMaxBumpType(changedTasks.map(task => task.bumpType))

  let targetVersion = chooseStableBaselineVersion(
    rootPackage.version,
    stableState?.rootVersion,
  )
  if (policyStatus.policy) {
    targetVersion = assignWorkspaceNextVersions(
      tasks,
      policyStatus.policy,
      branch,
      workspaceMode,
    )
  }

  const packagePlans: PreviewPackagePlan[] = Array.from(tasks.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(task => ({
      name: task.name,
      private: task.private,
      currentVersion: task.version,
      nextVersion: task.nextVersion,
      bumpType: task.bumpType,
      isPassive: task.isPassive,
      passiveReasons: task.passiveReasons,
      commitCount: task.commits.length,
    }))

  const releasePackageCount = packagePlans.filter(
    pkg =>
      !pkg.private && pkg.nextVersion && pkg.nextVersion !== pkg.currentVersion,
  ).length

  const result: PreviewResult = {
    mode: 'workspace',
    branch,
    policy: policyStatus,
    currentVersion: rootPackage.version,
    targetVersion,
    commitCount: packagePlans.reduce((sum, row) => sum + row.commitCount, 0),
    releasePackageCount,
    packages: packagePlans,
  }

  if (includeChangelog) {
    const repoUrl = await getRepoUrl(cwd)
    const { draftHealth, importedDrafts } = await buildDraftHealth(
      cwd,
      getCoreVersion(targetVersion),
    )
    result.draftHealth = draftHealth
    result.changelog = {
      entryPreview: renderWorkspaceRootPreview(
        Array.from(tasks.values()),
        config,
        repoUrl,
      ),
      importedDrafts,
    }
  }

  if (
    !changedTasks.length &&
    policyStatus.policy &&
    !policyStatus.policy.startsWith('pre') &&
    semver.prerelease(targetVersion)
  ) {
    result.targetVersion = computeVersionByPolicy(
      targetVersion,
      highestBump,
      'patch',
      branch,
    )
  }

  return result
}

/**
 * @en Build preview context including mode, package manager, and branches.
 * @zh 构建预览上下文，包含模式、包管理器与分支信息。
 *
 * @param cwd
 * @en Workspace root directory.
 * @zh 工作区根目录。
 *
 * @returns
 * @en Resolved preview context.
 * @zh 解析后的预览上下文。
 */
export async function getPreviewContext(cwd: string): Promise<PreviewContext> {
  const [config, packageManager, currentBranch] = await Promise.all([
    loadConfig(cwd),
    detectPackageManager(cwd),
    getCurrentBranch(cwd),
  ])

  return {
    cwd,
    mode: config.workspace ? 'workspace' : 'single',
    workspaceMode: config.workspace?.mode,
    packageManager: packageManager.name,
    currentBranch: currentBranch || 'unknown',
    availableBranches: Object.keys(config.branches || {}),
  }
}

/**
 * @en Compute preview result for single or workspace mode.
 * @zh 为单包或工作区模式计算预览结果。
 *
 * @param options
 * @en Preview build options.
 * @zh 预览构建参数。
 *
 * @returns
 * @en Computed preview result payload.
 * @zh 计算后的预览结果。
 */
export async function buildPreviewResult(
  options: BuildPreviewOptions,
): Promise<PreviewResult> {
  const { cwd } = options
  const config = await loadConfig(cwd)
  const branch = options.branch || (await getCurrentBranch(cwd)) || 'unknown'

  if (config.workspace) {
    return buildWorkspacePreview({
      cwd,
      branch,
      config,
      includeChangelog: options.includeChangelog,
    })
  }

  return buildSinglePreview({
    cwd,
    branch,
    config,
    includeChangelog: options.includeChangelog,
  })
}

/**
 * @en Build pre-release checks from preview result.
 * @zh 基于预览结果构建发布前检查项。
 *
 * @param cwd
 * @en Workspace root directory.
 * @zh 工作区根目录。
 *
 * @param preview
 * @en Preview result used by checks.
 * @zh 用于检查的预览结果。
 *
 * @returns
 * @en Ordered list of check items.
 * @zh 有序检查项列表。
 */
export async function buildPreviewChecks(
  cwd: string,
  preview: PreviewResult,
): Promise<PreviewCheckItem[]> {
  const checks: PreviewCheckItem[] = []
  const branch = preview.branch

  checks.push({
    id: 'policy',
    title: 'Branch Policy',
    message: preview.policy.ok
      ? `Branch "${branch}" is allowed with policy "${preview.policy.policy}".`
      : preview.policy.message || `Branch "${branch}" is not allowed.`,
    level: preview.policy.ok ? 'info' : 'blocker',
    ok: preview.policy.ok,
  })

  try {
    const [dirtyStatus, syncStatus] = await Promise.all([
      runSafe('git', ['status', '--porcelain'], { cwd }),
      runSafe(
        'git',
        ['rev-list', '--left-right', '--count', `${branch}...origin/${branch}`],
        { cwd },
      ),
    ])

    const dirty = dirtyStatus.stdout.trim().length > 0
    const [aheadRaw, behindRaw] = syncStatus.stdout.trim().split('\t')
    const ahead = Number(aheadRaw || 0)
    const behind = Number(behindRaw || 0)
    const syncOk = !dirty && ahead === 0 && behind === 0

    checks.push({
      id: 'git-sync',
      title: 'Git Sync',
      message: syncOk
        ? 'Working tree is clean and branch is synchronized with origin.'
        : `dirty=${dirty}, ahead=${ahead}, behind=${behind}`,
      level: syncOk ? 'info' : 'warn',
      ok: syncOk,
    })
  } catch {
    checks.push({
      id: 'git-sync',
      title: 'Git Sync',
      message: 'Unable to determine git sync status.',
      level: 'warn',
      ok: false,
    })
  }

  if (preview.targetVersion) {
    const globalTag = `v${preview.targetVersion}`
    try {
      const [localExists, remoteExists] = await Promise.all([
        hasLocalTag(cwd, globalTag),
        hasRemoteTag(cwd, globalTag),
      ])
      const tagOk = !localExists && !remoteExists
      checks.push({
        id: 'tag',
        title: 'Tag Conflict',
        message: tagOk
          ? `No conflict for tag "${globalTag}".`
          : `Tag "${globalTag}" already exists${localExists ? ' locally' : ''}${remoteExists ? ' on origin' : ''}.`,
        level: tagOk ? 'info' : 'blocker',
        ok: tagOk,
      })
    } catch {
      checks.push({
        id: 'tag',
        title: 'Tag Conflict',
        message: `Remote tag check skipped for "${globalTag}" due to network/runtime limitation.`,
        level: 'warn',
        ok: true,
      })
    }
  }

  try {
    if (preview.mode === 'single') {
      const pkg = await readJSON(path.join(cwd, 'package.json'))
      const exists = preview.targetVersion
        ? await checkRegistryWithTimeout(pkg.name, preview.targetVersion)
        : false
      checks.push({
        id: 'registry',
        title: 'Registry Conflict',
        message: exists
          ? `${pkg.name}@${preview.targetVersion} already exists in registry.`
          : 'No registry conflict detected for computed target version.',
        level: exists ? 'blocker' : 'info',
        ok: !exists,
      })
    } else if (preview.packages) {
      const publishable = preview.packages.filter(
        row =>
          !row.private &&
          row.nextVersion &&
          row.nextVersion !== row.currentVersion,
      )
      const conflicts: string[] = []
      for (const row of publishable) {
        const exists = await checkRegistryWithTimeout(
          row.name,
          row.nextVersion!,
        )
        if (exists) conflicts.push(`${row.name}@${row.nextVersion}`)
      }
      checks.push({
        id: 'registry',
        title: 'Registry Conflict',
        message:
          conflicts.length > 0
            ? `Existing versions found: ${conflicts.join(', ')}`
            : 'No registry conflict detected for computed package versions.',
        level: conflicts.length > 0 ? 'blocker' : 'info',
        ok: conflicts.length === 0,
      })
    }
  } catch {
    checks.push({
      id: 'registry',
      title: 'Registry Conflict',
      message: 'Registry check skipped due to network/runtime limitation.',
      level: 'warn',
      ok: true,
    })
  }

  return checks
}

/**
 * @en Build draft health summary for target version.
 * @zh 构建目标版本的草稿健康摘要。
 *
 * @param cwd
 * @en Workspace root directory.
 * @zh 工作区根目录。
 *
 * @param targetVersion
 * @en Optional target version override.
 * @zh 可选目标版本覆盖值。
 *
 * @returns
 * @en Draft health object.
 * @zh 草稿健康对象。
 */
export async function getDraftHealthSummary(
  cwd: string,
  targetVersion?: string,
): Promise<PreviewDraftHealth> {
  let resolvedTarget = targetVersion
  if (!resolvedTarget) {
    const rootPackage = await readJSON(path.join(cwd, 'package.json'))
    resolvedTarget = getCoreVersion(String(rootPackage.version || '0.0.0'))
  }

  const report = await readChangelogDraftsWithReport(cwd)
  const analysis = analyzeDraftsForTargetVersion(report.records, resolvedTarget)

  return {
    target: resolvedTarget,
    matching: analysis.matching.length,
    behind: analysis.behind.length,
    ahead: analysis.ahead.length,
    invalid: analysis.invalid.length,
    malformedFileCount: report.malformedFileCount,
    behindSamples: analysis.behind
      .slice(0, 5)
      .map(record => `${record.draft.branch}@${record.draft.version}`),
  }
}

/**
 * @en Prune draft files based on target version analysis.
 * @zh 根据目标版本分析结果清理草稿文件。
 *
 * @param cwd
 * @en Workspace root directory.
 * @zh 工作区根目录。
 *
 * @param request
 * @en Prune request payload.
 * @zh 清理请求参数。
 *
 * @returns
 * @en Prune operation summary.
 * @zh 清理操作摘要。
 */
export async function pruneDrafts(
  cwd: string,
  request: DraftPruneRequest,
): Promise<DraftPruneResult> {
  const report = await readChangelogDraftsWithReport(cwd)
  const analysis = analyzeDraftsForTargetVersion(report.records, request.target)
  const targets = request.only === 'behind' ? analysis.behind : []

  const affectedFiles = targets.map(record => record.filePath)
  if (!request.dryRun) {
    for (const filePath of affectedFiles) {
      await removeChangelogDraft(filePath)
    }
  }

  const remaining =
    report.records.length - (request.dryRun ? 0 : affectedFiles.length)
  return {
    prunedCount: request.dryRun ? 0 : affectedFiles.length,
    remaining: Math.max(remaining, 0),
    affectedFiles,
  }
}
