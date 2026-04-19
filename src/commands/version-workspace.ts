import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { BranchType, NxspubConfig, WorkspaceMode } from '../config'
import { abort } from '../utils/errors'
import {
  analyzeDraftsForTargetVersion,
  applyContributorsToChangelog,
  archiveChangelogIfNeeded,
  canWriteChangelogOnBranch,
  cleanupExistingEntry,
  extractShortCommitHashes,
  parseCommit,
  readChangelogDraftsWithReport,
  removeChangelogDraft,
  writeChangelogDraft,
} from '../utils/changelog'
import { formatDate } from '../utils/date'
import {
  createLinkProvider,
  ensureGitSync,
  hasLocalTag,
  hasRemoteTag,
  resolveBranchPolicy,
  getCurrentBranch,
  getLastReleaseCommit,
  getPackageCommits,
  getRepoUrl,
  run,
} from '../utils/git'
import { cliLogger } from '../utils/logger'
import {
  chooseStableBaselineVersion,
  loadReleaseState,
  updateStableBranchState,
} from '../utils/release-state'
import {
  loadPackageJSON,
  readJSON,
  savePackageJSON,
  scanWorkspacePackages,
  topologicalSort,
  writeJSON,
  type PackageTask,
} from '../utils/packages'
import type { VersionOptions } from './types'
import {
  determineBumpType,
  getHighestBumpType,
  getMaxBumpType,
} from '../utils/versions'

/**
 * @en Compute and apply versions/changelogs for all workspace packages.
 * @zh 为工作区全部包计算并应用版本与变更日志。
 *
 * @param options
 * @en Version command options.
 * @zh 版本命令参数。
 *
 * @param config
 * @en Resolved nxspub configuration.
 * @zh 已解析的 nxspub 配置。
 *
 * @returns
 * @en Resolves when workspace versioning is completed.
 * @zh 工作区版本处理完成后返回。
 */
export async function versionWorkspace(
  options: VersionOptions,
  config: NxspubConfig,
) {
  const { cwd, dry } = options
  const mode = config.workspace?.mode || 'locked'

  const currentBranch = await getCurrentBranch(cwd)
  const branchReleasePolicy = resolveBranchPolicy(
    currentBranch!,
    config.branches,
  )
  if (!branchReleasePolicy) {
    cliLogger.error(
      `Admission Denied: Branch "${currentBranch}" not configured.`,
    )
    abort(1)
  }

  if (currentBranch && !dry) {
    await ensureGitSync(currentBranch, cwd)
  }

  cliLogger.step(`Workspace Release: ${mode.toUpperCase()} MODE`)

  const lastRelease = await getLastReleaseCommit(cwd)
  const workspacePackages = await scanWorkspacePackages(cwd)
  const repoUrl = await getRepoUrl(cwd)
  const shouldWriteChangelog = canWriteChangelogOnBranch(
    config.changelog?.writeOnBranches,
    currentBranch,
  )
  const stableBranchState =
    branchReleasePolicy === 'latest' && currentBranch
      ? (await loadReleaseState(cwd)).branches?.[currentBranch]
      : undefined

  const tasks = new Map<string, PackageTask>()
  for (const info of workspacePackages) {
    const normalizedVersion = chooseStableBaselineVersion(
      info.version,
      stableBranchState?.packageVersions?.[info.name],
    )
    if (normalizedVersion !== info.version) {
      cliLogger.dim(
        `Using stable baseline version ${normalizedVersion} for ${info.name} (was ${info.version}).`,
      )
    }

    const commits = await getPackageCommits(
      cwd,
      info.relativeDir,
      lastRelease?.hash,
    )
    let bumpType = determineBumpType(commits, config)

    const isPrereleaseBranchPolicy = branchReleasePolicy.startsWith('pre')

    if (
      !bumpType &&
      !isPrereleaseBranchPolicy &&
      semver.prerelease(normalizedVersion)
    ) {
      bumpType = 'patch'
      cliLogger.item(
        `[${info.name}] No new commits, promoting pre-release to stable.`,
      )
    }

    tasks.set(info.name, {
      ...info,
      version: normalizedVersion,
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
    cliLogger.success('No incremental changes detected in any packages.')
    return
  }

  const globalNextVersion = calculateVersions(
    tasks,
    branchReleasePolicy,
    currentBranch!,
    mode,
  )

  if (dry) {
    cliLogger.warn('DRY RUN: Version changes preview:')
    cliLogger.item(`Root Package: -> ${globalNextVersion}`)
    changedTasks.forEach(t => {
      cliLogger.item(
        `${t.name}: ${t.version} → ${t.nextVersion} ${t.private ? '[PRIVATE]' : ''}`,
      )
    })
    return
  }

  cliLogger.step('Updating workspace files...')

  if (globalNextVersion) {
    const rootPackageJson = await loadPackageJSON('package.json', cwd)
    rootPackageJson.raw.version = globalNextVersion
    await savePackageJSON(rootPackageJson)
    cliLogger.success(`Updated root package.json to ${globalNextVersion}`)
  }

  const rootNewEntries: string[] = []
  const rootDraftItems: { label: string; hash: string; content: string }[] = []

  for (const task of tasks.values()) {
    if (!task.nextVersion || task.nextVersion === task.version) continue

    if (!task.private) {
      const archivedFooter = shouldWriteChangelog
        ? await archiveChangelogIfNeeded(
            task.changelogPath,
            task.version,
            task.bumpType || 'patch',
            branchReleasePolicy.startsWith('pre'),
          )
        : undefined

      const result = await updatePackageChangelog(
        task,
        config,
        cwd,
        repoUrl,
        lastRelease?.hash,
        lastRelease?.version,
        shouldWriteChangelog,
        archivedFooter,
      )

      if (result?.entry) {
        rootNewEntries.push(result.entry)
        if (result.commitHashes.length > 0) {
          for (const hash of result.commitHashes) {
            rootDraftItems.push({
              label: '__root__',
              hash,
              content: result.entry,
            })
          }
        } else {
          rootDraftItems.push({
            label: '__root__',
            hash: `draft-${task.name}-${task.nextVersion}`,
            content: result.entry,
          })
        }
      }
    }

    const rawPkg = await readJSON(task.pkgPath)
    rawPkg.version = task.nextVersion
    updateInternalDeps(rawPkg, tasks)
    await writeJSON(task.pkgPath, rawPkg)

    if (task.bumpType || task.isPassive) {
      cliLogger.success(`Updated ${task.name} to ${task.nextVersion}`)
    }
  }

  if (shouldWriteChangelog && globalNextVersion) {
    const rootChangelogPath = path.join(cwd, 'CHANGELOG.md')
    const existingRootChangelog = await fs
      .readFile(rootChangelogPath, 'utf-8')
      .catch(() => '')
    const presentShortHashes = extractShortCommitHashes(
      existingRootChangelog + '\n' + rootNewEntries.join('\n'),
    )
    const presentContents = new Set(rootNewEntries)
    const draftReadReport = await readChangelogDraftsWithReport(cwd)
    const draftAnalysis = analyzeDraftsForTargetVersion(
      draftReadReport.records,
      globalNextVersion,
    )
    const draftRecords = draftAnalysis.matching
    if (draftAnalysis.behind.length > 0) {
      cliLogger.warn(
        `Found ${draftAnalysis.behind.length} stale draft(s) behind ${globalNextVersion}. Run cleanup if they are already merged manually.`,
      )
    }
    if (draftAnalysis.ahead.length > 0) {
      cliLogger.dim(
        `Found ${draftAnalysis.ahead.length} draft(s) for future versions; kept for later import.`,
      )
    }
    if (draftAnalysis.invalid.length > 0) {
      cliLogger.warn(
        `Ignored ${draftAnalysis.invalid.length} malformed draft file(s).`,
      )
    }
    if (draftReadReport.malformedFileCount > 0) {
      cliLogger.warn(
        `Skipped ${draftReadReport.malformedFileCount} unreadable draft file(s).`,
      )
    }

    for (const record of draftRecords) {
      let importedCount = 0

      for (const item of record.draft.items) {
        if (item.label !== '__root__') continue
        if (presentContents.has(item.content)) continue

        const shortHash = item.hash.slice(0, 7).toLowerCase()
        const hashIsSynthetic = item.hash.startsWith('draft-')
        if (!hashIsSynthetic && presentShortHashes.has(shortHash)) continue

        rootNewEntries.push(item.content)
        presentContents.add(item.content)
        if (!hashIsSynthetic) {
          presentShortHashes.add(shortHash)
        }
        importedCount++
      }

      await removeChangelogDraft(record.filePath)

      if (importedCount > 0) {
        cliLogger.item(
          `Imported ${importedCount} draft workspace changelog section(s) from ${record.draft.branch}@${record.draft.version}`,
        )
      }
    }
  } else if (!shouldWriteChangelog) {
    const draftBranch = currentBranch || 'unknown'
    if (rootDraftItems.length > 0) {
      await writeChangelogDraft(cwd, {
        schemaVersion: 1,
        branch: draftBranch,
        version: globalNextVersion,
        generatedAt: new Date().toISOString(),
        items: rootDraftItems,
      })
      cliLogger.item(
        `Saved changelog draft for ${draftBranch}@${globalNextVersion} in .nxspub/changelog-drafts`,
      )
    }
    cliLogger.dim(
      `Skipping changelog write on branch "${currentBranch}" due to changelog.writeOnBranches config.`,
    )
  }

  if (shouldWriteChangelog && rootNewEntries.length > 0 && globalNextVersion) {
    await updateRootChangelog(
      cwd,
      rootNewEntries,
      repoUrl,
      lastRelease?.hash,
      lastRelease?.version,
      globalNextVersion,
    )
  }

  if (branchReleasePolicy === 'latest' && currentBranch) {
    const packageVersions: Record<string, string> = {}
    for (const task of tasks.values()) {
      packageVersions[task.name] = task.nextVersion || task.version
    }
    await updateStableBranchState(cwd, currentBranch, {
      rootVersion: globalNextVersion,
      packageVersions,
    })
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
  releasePolicy: BranchType,
  branch: string,
  mode: WorkspaceMode,
): string {
  const prereleaseIdentifier = branch.replace(/\//g, '-')

  const allBumps = Array.from(tasks.values()).map(t => t.bumpType)
  const highestBump = getMaxBumpType(allBumps)
  const maxCurrentVer = Array.from(tasks.values())
    .map(t => t.version)
    .sort(semver.rcompare)[0]

  const globalNext = bumpVersionByPolicy(
    maxCurrentVer,
    highestBump,
    releasePolicy,
    prereleaseIdentifier,
  )

  if (mode === 'locked') {
    for (const t of tasks.values()) t.nextVersion = globalNext
    return globalNext
  } else {
    for (const t of tasks.values()) {
      if (t.bumpType) {
        t.nextVersion = bumpVersionByPolicy(
          t.version,
          t.bumpType,
          releasePolicy,
          prereleaseIdentifier,
        )
      }
    }
    return globalNext
  }
}

function bumpVersionByPolicy(
  version: string,
  bumpType: BranchType,
  releasePolicy: BranchType,
  prereleaseIdentifier: string,
) {
  if (releasePolicy.startsWith('pre')) {
    const prereleaseTokens = semver.prerelease(version)
    const currentPrereleaseIdentifier =
      prereleaseTokens && typeof prereleaseTokens[0] === 'string'
        ? prereleaseTokens[0]
        : undefined
    const shouldContinueCurrentChannel =
      !!prereleaseTokens && currentPrereleaseIdentifier === prereleaseIdentifier
    return semver.inc(
      version,
      shouldContinueCurrentChannel
        ? 'prerelease'
        : (releasePolicy as semver.ReleaseType),
      prereleaseIdentifier,
    )!
  }
  return semver.inc(version, bumpType as semver.ReleaseType)!
}

async function updatePackageChangelog(
  task: PackageTask,
  config: NxspubConfig,
  cwd: string,
  repoUrl: string,
  lastHash: string | undefined,
  lastVer: string | undefined,
  shouldWritePackageChangelog: boolean,
  archivedFooter?: string,
) {
  if (task.commits.length === 0 && !task.isPassive) return null

  const date = formatDate()

  const links = createLinkProvider(repoUrl)

  const compareUrl = links.compare(lastVer, task.nextVersion!)

  const groups: Record<string, string[]> = {}
  const commitHashes: string[] = []

  if (task.isPassive && task.passiveReasons) {
    const depsLabel = config.changelog?.labels?.['deps'] || 'Dependencies'
    if (!groups[depsLabel]) groups[depsLabel] = []

    const strategy = config.workspace?.passive ?? 'patch'
    const reason = `internal dependency upgrade (due to ${task.passiveReasons.join(', ')} via \`${strategy}\` strategy)`

    groups[depsLabel].push(`* **internal:** ${reason}`)
  }

  task.commits.forEach(c => {
    const parsed = parseCommit(c.message, repoUrl)
    if (!parsed) return

    const label = config.changelog?.labels?.[parsed.type]
    if (!label) return

    if (!groups[label]) groups[label] = []

    const scopeText = parsed.scope ? `**${parsed.scope}:** ` : ''
    const breakingTag = parsed.isBreaking ? `**[BREAKING CHANGE]** ` : ''
    const commitLink = `([${c.hash.slice(0, 7)}](${links.commit(c.hash)}))`
    const prsText =
      parsed.prLinks.length > 0 ? ` ${parsed.prLinks.join(' ')}` : ''
    const closesSuffix =
      parsed.linkedIssues.length > 0
        ? ` (closes ${parsed.linkedIssues.join(', ')})`
        : ''

    let entry = `* ${scopeText}${breakingTag}${parsed.subject}${prsText} ${commitLink}${closesSuffix}`

    if (parsed.bodyLines.length > 0) {
      entry += `\n  > ${parsed.bodyLines
        .map(line => {
          line = line.trim()
          if (line.startsWith('-')) {
            return line.slice(1).trim()
          }
          return line
        })
        .join('\n  \n  > ')}`
    }

    if (parsed.breakingDetail) {
      const separator = parsed.bodyLines.length > 0 ? '\n  ' : ''
      entry += `\n${separator}  > **BREAKING CHANGE:** ${parsed.breakingDetail.replace(/\n/g, '\n  > ')}`
    }

    groups[label].push(entry)
    commitHashes.push(c.hash)
  })

  if (shouldWritePackageChangelog) {
    let localEntry = `## [${task.nextVersion}](${compareUrl}) (${date})\n\n`

    for (const [label, lines] of Object.entries(groups)) {
      localEntry += `### ${label}\n${lines.join('\n')}\n\n`
    }

    const existing =
      archivedFooter ??
      (await fs.readFile(task.changelogPath, 'utf-8').catch(() => ''))

    const cleanedExisting = cleanupExistingEntry(existing, task.nextVersion!)

    localEntry = await applyContributorsToChangelog(
      localEntry,
      cwd,
      repoUrl,
      lastHash,
      task.relativeDir,
    )

    await fs.writeFile(
      task.changelogPath,
      (localEntry + cleanedExisting).trim() + '\n',
    )
  }

  const rootLines: string[] = []
  for (const [label, lines] of Object.entries(groups)) {
    rootLines.push(`- **${label}**`)
    lines.forEach(line => {
      rootLines.push(`  ${line.replace(/^\* /, '- ')}`)
    })
  }

  const rootEntry = `### ${task.name}@${task.nextVersion}\n${rootLines.join('\n')}`

  return { entry: rootEntry, commitHashes }
}

async function updateRootChangelog(
  cwd: string,
  entries: string[],
  repoUrl: string,
  lastHash: string | undefined,
  lastVer: string | undefined,
  nextVer: string,
) {
  const rootPath = path.join(cwd, 'CHANGELOG.md')
  const date = formatDate()
  const links = createLinkProvider(repoUrl)
  const compareUrl = links.compare(lastVer, nextVer)

  let rootEntry =
    `## [${nextVer}](${compareUrl}) (${date})\n\n` +
    entries.join('\n\n') +
    '\n\n'

  rootEntry = await applyContributorsToChangelog(
    rootEntry,
    cwd,
    repoUrl,
    lastHash,
  )
  const existing = await fs.readFile(rootPath, 'utf-8').catch(() => '')
  const cleanedExisting = cleanupExistingEntry(existing, nextVer)
  await fs.writeFile(rootPath, rootEntry + cleanedExisting)
}

function updateInternalDeps(raw: unknown, tasks: Map<string, PackageTask>) {
  type PackageJsonLike = {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    resolutions?: Record<string, string>
    overrides?: Record<string, string>
    pnpm?: {
      overrides?: Record<string, string>
    }
  }

  const pkg = raw as PackageJsonLike
  const update = (deps?: Record<string, string>) => {
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

  update(pkg.dependencies)
  update(pkg.devDependencies)
  update(pkg.peerDependencies)
  update(pkg.optionalDependencies)
  update(pkg.resolutions)
  update(pkg.overrides)

  if (pkg.pnpm?.overrides) {
    update(pkg.pnpm.overrides)
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

  const taggable = changed.filter(t => !t.private)
  const tagsToCreate: string[] = []

  if (mode === 'locked' && taggable.length > 0) {
    tagsToCreate.push(`v${globalNextVersion}`)
  } else {
    for (const t of taggable) {
      tagsToCreate.push(`${t.name}@${t.nextVersion}`)
    }
    tagsToCreate.push(`v${globalNextVersion}`)
  }

  for (const tag of tagsToCreate) {
    if (await hasLocalTag(cwd, tag)) {
      cliLogger.error(
        `Tag "${tag}" already exists locally. Stop to avoid ambiguous release state.`,
      )
      abort(1)
    }
    if (await hasRemoteTag(cwd, tag)) {
      cliLogger.error(
        `Tag "${tag}" already exists on origin. Stop to avoid duplicate release.`,
      )
      abort(1)
    }
  }

  await run('git', ['add', '-A'], { cwd })
  await run('git', ['commit', '-m', msg], { cwd })

  for (const tag of tagsToCreate) {
    await run('git', ['tag', tag], { cwd })
  }

  await run(
    'git',
    [
      'push',
      '--atomic',
      'origin',
      'HEAD',
      ...tagsToCreate.map(tag => `refs/tags/${tag}`),
    ],
    { cwd },
  )

  cliLogger.success(
    `Released ${taggable.length} public packages [Global: v${globalNextVersion}]`,
  )
}
