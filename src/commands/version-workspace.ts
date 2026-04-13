import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { BrancheType, NxspubConfig } from '../config'
import { formatDate } from '../utils/date'
import {
  getBranchContract,
  getCompareUrl,
  getCurrentBranch,
  getLastReleaseCommit,
  getPackageCommits,
  getRepoUrl,
  run,
  runSafe,
} from '../utils/git'
import { nxsLog } from '../utils/logger'
import {
  readJSON,
  scanWorkspacePackages,
  writeJSON,
  type PackageInfo,
} from '../utils/packages'

/**
 * @en Full versioning task with runtime state.
 * @zh 带有运行时状态的完整版本管理任务。
 */
interface PackageTask extends PackageInfo {
  /** @en Git commits since last release. @zh 自上次发布以来的 Git 提交。 */
  commits: { message: string; hash: string }[]
  /** @en Determined bump type. @zh 确定的升级类型。 */
  bumpType: BrancheType | null
  /** @en Triggered by dependency change. @zh 是否由依赖变动被动触发。 */
  isPassive: boolean
  /** @en Calculated next version. @zh 计算出的新版本。 */
  nextVersion?: string
}

export async function versionWorkspace(
  options: { cwd: string; dry?: boolean },
  config: NxspubConfig,
) {
  const { cwd, dry } = options
  const mode = config.workspaceMode || 'locked'

  const currentBranch = await getCurrentBranch()
  const branchContract = getBranchContract(currentBranch!, config.branches)
  if (!branchContract) {
    nxsLog.error(`Admission Denied: Branch "${currentBranch}" not configured.`)
    process.exit(1)
  }

  nxsLog.step(`Workspace Release: ${mode.toUpperCase()} MODE`)

  const lastRelease = await getLastReleaseCommit()
  const allInfos = await scanWorkspacePackages(cwd)
  const repoUrl = await getRepoUrl()

  const tasks = new Map<string, PackageTask>()
  for (const info of allInfos) {
    const commits = await getPackageCommits(
      cwd,
      info.relativeDir,
      lastRelease?.hash,
    )
    const bumpType = determineBumpType(commits, config)

    tasks.set(info.name, {
      ...info,
      commits,
      bumpType,
      isPassive: false,
    })
  }

  propagateWorkspaceChanges(tasks)

  const changedTasks = Array.from(tasks.values()).filter(
    t => t.bumpType || t.isPassive,
  )
  if (changedTasks.length === 0) {
    nxsLog.success('No incremental changes detected in any packages.')
    return
  }

  calculateVersions(tasks, branchContract, currentBranch!, mode)

  if (dry) {
    nxsLog.warn('DRY RUN: Version changes preview:')
    changedTasks.forEach(t => {
      const tag = t.private ? '[PRIVATE]' : ''
      nxsLog.item(`${t.name}: ${t.version} → ${t.nextVersion} ${tag}`)
    })
    return
  }

  nxsLog.step('Updating workspace files...')
  const rootNewEntries: string[] = []

  for (const task of tasks.values()) {
    if (!task.nextVersion || task.nextVersion === task.version) continue

    if (!task.private) {
      const entry = await updatePackageChangelog(
        task,
        config,
        repoUrl,
        lastRelease?.version,
      )
      if (entry) rootNewEntries.push(entry)
    }

    const rawPkg = await readJSON(task.pkgPath)
    rawPkg.version = task.nextVersion
    updateInternalDeps(rawPkg, tasks)
    await writeJSON(task.pkgPath, rawPkg)

    nxsLog.success(
      `Updated ${task.name} to ${task.nextVersion} ${task.private ? '(Private)' : ''}`,
    )
  }

  if (rootNewEntries.length > 0) {
    await updateRootChangelog(cwd, rootNewEntries, branchContract)
  }

  await commitAndTagWorkspace(cwd, tasks, mode, branchContract)
}

function determineBumpType(
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

function propagateWorkspaceChanges(tasks: Map<string, PackageTask>) {
  let changed = true
  while (changed) {
    changed = false
    for (const task of tasks.values()) {
      if (task.bumpType) continue
      if (
        task.dependencies.some(
          dep => tasks.get(dep)?.bumpType || tasks.get(dep)?.isPassive,
        )
      ) {
        task.isPassive = true
        task.bumpType = 'patch'
        changed = true
      }
    }
  }
}

function calculateVersions(
  tasks: Map<string, PackageTask>,
  contract: BrancheType,
  branch: string,
  mode: 'independent' | 'locked',
) {
  const preid = branch.replace(/\//g, '-')
  const weights: Record<BrancheType, number> = {
    major: 3,
    premajor: 3,
    minor: 2,
    preminor: 2,
    patch: 1,
    prepatch: 1,
    latest: 1,
  }

  if (mode === 'locked') {
    const bumps = Array.from(tasks.values())
      .map(t => t.bumpType)
      .filter((b): b is BrancheType => b !== null)
    const highest = bumps.sort((a, b) => weights[b] - weights[a])[0] || 'patch'
    const maxVer = Array.from(tasks.values())
      .map(t => t.version)
      .sort(semver.rcompare)[0]
    const next = inc(maxVer, highest, contract, preid)
    for (const t of tasks.values()) t.nextVersion = next
  } else {
    for (const t of tasks.values()) {
      if (t.bumpType)
        t.nextVersion = inc(t.version, t.bumpType, contract, preid)
    }
  }
}

function inc(
  v: string,
  bump: BrancheType,
  contract: BrancheType,
  preid: string,
) {
  if (contract.startsWith('pre')) {
    const isPre = !!semver.prerelease(v)
    return semver.inc(
      v,
      isPre ? 'prerelease' : (contract as semver.ReleaseType),
      preid,
    )!
  }
  return semver.inc(v, bump as semver.ReleaseType)!
}

async function updatePackageChangelog(
  task: PackageTask,
  config: NxspubConfig,
  repoUrl: string,
  lastVer?: string,
) {
  if (task.commits.length === 0 && !task.isPassive) return null
  if (
    !semver.prerelease(task.nextVersion!) &&
    (task.bumpType === 'major' || task.bumpType === 'minor')
  ) {
    await archiveChangelog(task)
  }
  const date = formatDate()
  const compareUrl = getCompareUrl(
    repoUrl,
    lastVer || task.version,
    task.nextVersion!,
  )
  let entry = `## [${task.nextVersion}](${compareUrl}) (${date})\n\n`
  if (task.isPassive) entry += `* **deps:** internal dependency upgrade\n`
  const groups: Record<string, string[]> = {}
  task.commits.forEach(c => {
    const type = c.message.match(/^(\w+)/)?.[1] || 'other'
    const label = config.changelog?.labels?.[type] || 'Others'
    if (!groups[label]) groups[label] = []
    groups[label].push(
      `* ${c.message} ([${c.hash.slice(0, 7)}](${repoUrl}/commit/${c.hash}))`,
    )
  })
  for (const [l, lines] of Object.entries(groups))
    entry += `### ${l}\n${lines.join('\n')}\n\n`
  const existing = await fs
    .readFile(task.changelogPath, 'utf-8')
    .catch(() => '')
  await fs.writeFile(task.changelogPath, (entry + existing).trim() + '\n')
  return `### ${task.name}@${task.nextVersion}\n${entry.split('\n').slice(1).join('\n')}`
}

async function archiveChangelog(task: PackageTask) {
  try {
    const content = await fs.readFile(task.changelogPath, 'utf-8')
    if (!content.trim() || content.includes('Previous Changelogs')) return
    await fs.mkdir(task.archiveDir, { recursive: true })
    const base = `${semver.major(task.version)}.${semver.minor(task.version)}`
    await fs.writeFile(
      path.join(task.archiveDir, `CHANGELOG-v${base}.md`),
      content,
    )
    await fs.writeFile(
      task.changelogPath,
      `## Previous Changelogs\n\nSee [v${base}](./changelogs/CHANGELOG-v${base}.md)\n`,
    )
  } catch {}
}

async function updateRootChangelog(
  cwd: string,
  entries: string[],
  contract: BrancheType,
) {
  const rootPath = path.join(cwd, 'CHANGELOG.md')
  const header = `## Workspace Release (${formatDate()}) ${contract.startsWith('pre') ? '[Pre-release]' : ''}\n\n`
  const existing = await fs.readFile(rootPath, 'utf-8').catch(() => '')
  await fs.writeFile(
    rootPath,
    header + entries.join('\n---\n') + '\n\n' + existing,
  )
}

function updateInternalDeps(raw: any, tasks: Map<string, PackageTask>) {
  ;['dependencies', 'devDependencies'].forEach(f => {
    if (!raw[f]) return
    for (const d in raw[f]) {
      const depTask = tasks.get(d)
      if (depTask?.nextVersion) raw[f][d] = `^${depTask.nextVersion}`
    }
  })
}

async function commitAndTagWorkspace(
  cwd: string,
  tasks: Map<string, PackageTask>,
  mode: 'independent' | 'locked',
  contract: BrancheType,
) {
  const changed = Array.from(tasks.values()).filter(
    t => t.nextVersion && t.nextVersion !== t.version,
  )
  let msg = `release: workspace ${formatDate()}\n\n`
  changed.forEach(
    t =>
      (msg += `- ${t.name}@${t.nextVersion}${t.private ? ' (private)' : ''}\n`),
  )

  await run('git', ['add', '-A'], { cwd })
  await run('git', ['commit', '-m', msg], { cwd })

  const taggable = changed.filter(t => !t.private)
  if (mode === 'locked' && taggable.length > 0) {
    const tagName = `v${taggable[0].nextVersion}`
    await runSafe('git', ['tag', tagName], { cwd })
  } else {
    for (const t of taggable)
      await runSafe('git', ['tag', `${t.name}@${t.nextVersion}`], { cwd })
  }

  await run('git', ['push', 'origin', '--tags'], { cwd })
  await run('git', ['push', 'origin'], { cwd })
  nxsLog.success(
    `Released ${taggable.length} public packages on ${contract} track.`,
  )
}
