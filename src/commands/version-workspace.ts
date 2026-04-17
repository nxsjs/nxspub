import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { BrancheType, NxspubConfig, WorkspaceMode } from '../config'
import {
  archiveChangelogIfNeeded,
  cleanupExistingEntry,
} from '../utils/changelog'
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
  topologicalSort,
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
    nxsLog.item(`Root Package: -> ${globalNextVersion}`)
    changedTasks.forEach(t => {
      nxsLog.item(
        `${t.name}: ${t.version} → ${t.nextVersion} ${t.private ? '[PRIVATE]' : ''}`,
      )
    })
    return
  }

  nxsLog.step('Updating workspace files...')

  if (globalNextVersion) {
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

  if (rootNewEntries.length > 0 && globalNextVersion) {
    await updateRootChangelog(
      cwd,
      rootNewEntries,
      repoUrl,
      lastRelease?.version,
      globalNextVersion,
    )
  }

  await commitAndTagWorkspace(cwd, tasks, mode, globalNextVersion)
}

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

    const changedDeps = task.dependencies
      .map(dep => tasks.get(dep))
      .filter(depTask => depTask?.bumpType || depTask?.isPassive)

    if (changedDeps.length > 0) {
      task.isPassive = true
      task.bumpType =
        passiveStrategy === 'follow' ? getHighestBumpType(task, tasks) : 'patch'

      task.passiveReasons = changedDeps.map(
        d => `${d!.name}@${d!.nextVersion || d!.version}`,
      )
    }
  }
}

function calculateVersions(
  tasks: Map<string, PackageTask>,
  contract: BrancheType,
  branch: string,
  mode: WorkspaceMode,
): string {
  const preid = branch.replace(/\//g, '-')

  const allBumps = Array.from(tasks.values()).map(t => t.bumpType)
  const highestBump = getMaxBumpType(allBumps)
  const maxCurrentVer = Array.from(tasks.values())
    .map(t => t.version)
    .sort(semver.rcompare)[0]

  const globalNext = inc(maxCurrentVer, highestBump, contract, preid)

  if (mode === 'locked') {
    for (const t of tasks.values()) t.nextVersion = globalNext
    return globalNext
  } else {
    for (const t of tasks.values()) {
      if (t.bumpType) {
        t.nextVersion = inc(t.version, t.bumpType, contract, preid)
      }
    }
    return globalNext
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

  const groups: Record<string, string[]> = {}

  if (task.isPassive && task.passiveReasons) {
    const depsLabel = config.changelog?.labels?.['deps'] || 'Dependencies'
    if (!groups[depsLabel]) groups[depsLabel] = []

    const strategy = config.workspace?.passive ?? 'patch'
    const reason = `internal dependency upgrade (due to ${task.passiveReasons.join(', ')} via \`${strategy}\` strategy)`

    groups[depsLabel].push(`* **internal:** ${reason}`)
  }

  task.commits.forEach(c => {
    const match = c.message.match(/^(\w+)(?:\(([^)]+)\))?:/)
    const type = match?.[1] || 'other'
    const scope = match?.[2]
    const label = config.changelog?.labels?.[type] || ''

    if (label) {
      if (!groups[label]) groups[label] = []

      const rawMsg = c.message.replace(/^.*?:\s*/, '')
      const formattedMsg = scope ? `**${scope}:** ${rawMsg}` : rawMsg

      groups[label].push(
        `* ${formattedMsg} ([${c.hash.slice(0, 7)}](${repoUrl}/commit/${c.hash}))`,
      )
    }
  })

  let localEntry = `## [${task.nextVersion}](${compareUrl}) (${date})\n\n`

  for (const [label, lines] of Object.entries(groups)) {
    localEntry += `### ${label}\n${lines.join('\n')}\n\n`
  }

  const existing =
    archivedFooter ??
    (await fs.readFile(task.changelogPath, 'utf-8').catch(() => ''))

  const cleanedExisting = cleanupExistingEntry(existing, task.nextVersion!)

  await fs.writeFile(
    task.changelogPath,
    (localEntry + cleanedExisting).trim() + '\n',
  )

  const rootLines: string[] = []
  for (const [label, lines] of Object.entries(groups)) {
    rootLines.push(`- **${label}**`)
    lines.forEach(line => {
      rootLines.push(`  ${line.replace(/^\* /, '-')}`)
    })
  }

  const rootEntry = `### ${task.name} ${task.nextVersion}\n${rootLines.join('\n')}`

  return { entry: rootEntry }
}

async function updateRootChangelog(
  cwd: string,
  entries: string[],
  repoUrl: string,
  lastVer: string | undefined,
  nextVer: string,
) {
  const rootPath = path.join(cwd, 'CHANGELOG.md')
  const date = formatDate()
  const compareUrl = getCompareUrl(repoUrl, lastVer || '0.0.0', nextVer)

  const header = `## [${nextVer}](${compareUrl}) (${date})\n\n`

  const existing = await fs.readFile(rootPath, 'utf-8').catch(() => '')
  const cleanedExisting = cleanupExistingEntry(existing, nextVer)
  await fs.writeFile(
    rootPath,
    header + entries.join('\n---\n') + '\n\n' + cleanedExisting,
  )
}

function updateInternalDeps(raw: any, tasks: Map<string, PackageTask>) {
  const fields = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
    'resolutions', // Yarn
    'overrides', // NPM
  ]

  const update = (deps: Record<string, string>) => {
    if (!deps) return
    for (const depKey in deps) {
      const depName =
        depKey.includes('/') && !depKey.startsWith('@')
          ? depKey.split('/').pop()!
          : depKey

      const depTask = tasks.get(depName)
      if (!depTask?.nextVersion) continue

      const currentRange = deps[depKey]
      if (['workspace:*', 'workspace:~', 'workspace:^'].includes(currentRange))
        continue

      const prefix = currentRange.match(/^([^0-9]+)/)?.[1] || ''
      deps[depKey] = `${prefix}${depTask.nextVersion}`
    }
  }

  fields.forEach(field => update(raw[field]))

  if (raw.pnpm?.overrides) {
    update(raw.pnpm.overrides)
  }
}

async function commitAndTagWorkspace(
  cwd: string,
  tasks: Map<string, PackageTask>,
  mode: WorkspaceMode,
  globalNextVersion: string,
) {
  const changed = Array.from(tasks.values()).filter(
    t => t.nextVersion && t.nextVersion !== t.version,
  )

  if (changed.length === 0) return

  let msg = `release: v${globalNextVersion}\n\n`

  changed.forEach(t => {
    msg += `- ${t.name}@${t.nextVersion}${t.private ? ' (private)' : ''}\n`
  })

  await run('git', ['add', '-A'], { cwd })
  await run('git', ['commit', '-m', msg], { cwd })

  const taggable = changed.filter(t => !t.private)

  if (mode === 'locked' && taggable.length > 0) {
    await runSafe('git', ['tag', `v${globalNextVersion}`], { cwd })
  } else {
    for (const t of taggable) {
      await runSafe('git', ['tag', `${t.name}@${t.nextVersion}`], { cwd })
    }
    await runSafe('git', ['tag', `v${globalNextVersion}`], { cwd })
  }

  await run('git', ['push', 'origin', '--tags'], { cwd })
  await run('git', ['push', 'origin'], { cwd })

  nxsLog.success(
    `Released ${taggable.length} public packages [Global: v${globalNextVersion}]`,
  )
}
