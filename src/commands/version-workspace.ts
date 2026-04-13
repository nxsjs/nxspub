import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { BrancheType, NxspubConfig, WorkspaceMode } from '../config'
import { archiveChangelogIfNeeded } from '../utils/changelog'
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
  loadPackageJSON,
  readJSON,
  savePackageJSON,
  scanWorkspacePackages,
  writeJSON,
  type PackageTask,
} from '../utils/packages'
import {
  determineBumpType,
  getHighestBumpType,
  getMaxBumpType,
} from '../utils/versions'

export async function versionWorkspace(
  options: { cwd: string; dry?: boolean },
  config: NxspubConfig,
) {
  const { cwd, dry } = options
  const mode = config.workspace?.mode || 'locked'

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

  propagateWorkspaceChanges(tasks, config)

  const changedTasks = Array.from(tasks.values()).filter(
    t => t.bumpType || t.isPassive,
  )
  if (changedTasks.length === 0) {
    nxsLog.success('No incremental changes detected in any packages.')
    return
  }

  const globalNextVersion = calculateVersions(
    tasks,
    branchContract,
    currentBranch!,
    mode,
  )

  if (dry) {
    nxsLog.warn('DRY RUN: Version changes preview:')
    if (mode === 'locked') nxsLog.item(`Root: -> ${globalNextVersion}`)
    changedTasks.forEach(t => {
      nxsLog.item(
        `${t.name}: ${t.version} → ${t.nextVersion} ${t.private ? '[PRIVATE]' : ''}`,
      )
    })
    return
  }

  nxsLog.step('Updating workspace files...')

  if (mode === 'locked' && globalNextVersion) {
    const pkg = await loadPackageJSON('package.json', cwd)
    pkg.raw.version = globalNextVersion
    await savePackageJSON(pkg)
    nxsLog.success(`Updated root package.json to ${globalNextVersion}`)
  }

  const rootNewEntries: string[] = []

  for (const task of tasks.values()) {
    if (!task.nextVersion || task.nextVersion === task.version) continue

    if (!task.private) {
      const archivedFooter = await archiveChangelogIfNeeded(
        task.changelogPath,
        task.version,
        task.bumpType || 'patch',
        branchContract.startsWith('pre'),
      )

      const result = await updatePackageChangelog(
        task,
        config,
        repoUrl,
        lastRelease?.version,
        archivedFooter,
      )

      if (result?.entry) rootNewEntries.push(result.entry)
    }

    const rawPkg = await readJSON(task.pkgPath)
    rawPkg.version = task.nextVersion
    updateInternalDeps(rawPkg, tasks)
    await writeJSON(task.pkgPath, rawPkg)

    if (task.bumpType || task.isPassive) {
      nxsLog.success(`Updated ${task.name} to ${task.nextVersion}`)
    }
  }

  if (rootNewEntries.length > 0) {
    await updateRootChangelog(cwd, rootNewEntries, branchContract)
  }

  await commitAndTagWorkspace(cwd, tasks, mode, branchContract)
}

/**
 * @en Propagate changes in topological order to ensure upstream packages
 * can sense downstream dependency updates.
 * @zh 拓扑序传播变更，确保上游包能感知到下游依赖的更新。
 */
function propagateWorkspaceChanges(
  tasks: Map<string, PackageTask>,
  config: NxspubConfig,
) {
  const passiveStrategy = config.workspace?.passive ?? 'patch'
  if (passiveStrategy === 'none') return

  const sortedNames = topologicalSort(tasks)

  for (const name of sortedNames) {
    const task = tasks.get(name)!
    if (task.bumpType) continue

    const hasChangedDependency = task.dependencies.some(
      dep => tasks.get(dep)?.bumpType || tasks.get(dep)?.isPassive,
    )

    if (hasChangedDependency) {
      task.isPassive = true
      task.bumpType =
        passiveStrategy === 'follow' ? getHighestBumpType(task, tasks) : 'patch'
    }
  }
}

/**
 * @en Topological sort implementation, supports circular dependency detection.
 * @zh 拓扑排序实现，支持循环依赖检测。
 */
function topologicalSort(tasks: Map<string, PackageTask>): string[] {
  const nodes = Array.from(tasks.keys())
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(name: string) {
    if (visiting.has(name)) {
      nxsLog.error(
        `Circular dependency detected: ${Array.from(visiting).join(' -> ')} -> ${name}`,
      )
      process.exit(1)
    }
    if (!visited.has(name)) {
      visiting.add(name)
      const task = tasks.get(name)
      if (task) {
        for (const dep of task.dependencies) {
          if (tasks.has(dep)) visit(dep)
        }
      }
      visiting.delete(name)
      visited.add(name)
      sorted.push(name)
    }
  }

  for (const node of nodes) visit(node)
  return sorted
}

/**
 * @en Calculate versions based on the mode. In Locked mode,
 * returns a single global new version.
 * @zh 根据模式计算版本。在 Locked 模式下返回全局新版本。
 */
function calculateVersions(
  tasks: Map<string, PackageTask>,
  contract: BrancheType,
  branch: string,
  mode: WorkspaceMode,
): string | undefined {
  const preid = branch.replace(/\//g, '-')

  if (mode === 'locked') {
    const allBumps = Array.from(tasks.values()).map(t => t.bumpType)
    const highestBump = getMaxBumpType(allBumps)

    const maxVer = Array.from(tasks.values())
      .map(t => t.version)
      .sort(semver.rcompare)[0]

    const next = inc(maxVer, highestBump, contract, preid)

    for (const t of tasks.values()) {
      t.nextVersion = next
    }
    return next
  } else {
    for (const t of tasks.values()) {
      if (t.bumpType) {
        t.nextVersion = inc(t.version, t.bumpType, contract, preid)
      }
    }
    return undefined
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
  lastVer: string | undefined,
  archivedFooter?: string,
) {
  if (task.commits.length === 0 && !task.isPassive) return null

  const date = formatDate()
  const compareUrl = getCompareUrl(
    repoUrl,
    lastVer || task.version,
    task.nextVersion!,
  )

  let localEntry = `## [${task.nextVersion}](${compareUrl}) (${date})\n\n`
  if (task.isPassive) localEntry += `* **deps:** internal dependency upgrade\n`

  const groups: Record<string, string[]> = {}
  task.commits.forEach(c => {
    const type = c.message.match(/^(\w+)/)?.[1] || 'other'
    const label = config.changelog?.labels?.[type] || 'Others'
    if (!groups[label]) groups[label] = []
    groups[label].push(
      `* ${c.message} ([${c.hash.slice(0, 7)}](${repoUrl}/commit/${c.hash}))`,
    )
  })

  for (const [l, lines] of Object.entries(groups)) {
    localEntry += `### ${l}\n${lines.join('\n')}\n\n`
  }

  const existing =
    archivedFooter !== undefined
      ? archivedFooter
      : await fs.readFile(task.changelogPath, 'utf-8').catch(() => '')

  await fs.writeFile(task.changelogPath, (localEntry + existing).trim() + '\n')

  const rootLines: string[] = []

  if (task.isPassive) {
    rootLines.push(`- **deps:** internal dependency upgrade`)
  }

  for (const [label, lines] of Object.entries(groups)) {
    rootLines.push(`- **${label}**`)
    lines.forEach(line => {
      rootLines.push(`  ${line.replace(/^\* /, '-')}`)
    })
  }

  const rootEntry = `### ${task.name} ${task.nextVersion}\n${rootLines.join('\n')}`

  return {
    entry: rootEntry,
    fullContent: localEntry + existing,
  }
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
  const dependencyFields = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]

  dependencyFields.forEach(field => {
    const deps = raw[field]
    if (!deps) return

    for (const depName in deps) {
      const depTask = tasks.get(depName)
      if (!depTask?.nextVersion) continue

      const currentRange = deps[depName]

      if (
        ['workspace:*', 'workspace:~', 'workspace:^'].includes(currentRange)
      ) {
        continue
      }

      const prefixMatch = currentRange.match(/^([^0-9]+)/)
      const prefix = prefixMatch ? prefixMatch[1] : ''

      deps[depName] = `${prefix}${depTask.nextVersion}`
    }
  })
}

async function commitAndTagWorkspace(
  cwd: string,
  tasks: Map<string, PackageTask>,
  mode: WorkspaceMode,
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
    for (const t of taggable) {
      await runSafe('git', ['tag', `${t.name}@${t.nextVersion}`], { cwd })
    }
  }

  await run('git', ['push', 'origin', '--tags'], { cwd })
  await run('git', ['push', 'origin'], { cwd })
  nxsLog.success(
    `Released ${taggable.length} public packages on ${contract} track.`,
  )
}
