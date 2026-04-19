import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { NxspubConfig } from '../config'
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
  resolveBranchPolicy,
  getCurrentBranch,
  hasLocalTag,
  hasRemoteTag,
  getLastReleaseCommit,
  getRawCommits,
  getRepoUrl,
  run,
  runSafe,
} from '../utils/git'
import { cliLogger } from '../utils/logger'
import { detectPackageManager } from '../utils/package-manager'
import {
  chooseStableBaselineVersion,
  loadReleaseState,
  updateStableBranchState,
} from '../utils/release-state'
import { readJSON, writeJSON } from '../utils/packages'
import { determineBumpType } from '../utils/versions'
import type { VersionOptions } from './types'

/**
 * @en Compute and apply the next version/changelog for a single package project.
 * @zh 为单包项目计算并应用下一个版本与变更日志。
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
 * @en Resolves when versioning steps are completed.
 * @zh 版本处理完成后返回。
 */
export async function versionSingle(
  options: VersionOptions,
  config: NxspubConfig,
) {
  const { cwd, dry } = options
  const pkgPath = path.resolve(cwd, 'package.json')
  const changelogPath = path.resolve(cwd, 'CHANGELOG.md')

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

  if (
    !(await fs
      .access(pkgPath)
      .then(() => true)
      .catch(() => false))
  ) {
    cliLogger.error('package.json not found.')
    return
  }

  const packageJson = await readJSON(pkgPath)
  const packageManager = await detectPackageManager(cwd)
  const stableBranchState =
    branchReleasePolicy === 'latest' && currentBranch
      ? (await loadReleaseState(cwd)).branches?.[currentBranch]
      : undefined
  const currentPackageVersion = chooseStableBaselineVersion(
    packageJson.version,
    stableBranchState?.rootVersion,
  )
  if (currentPackageVersion !== packageJson.version) {
    cliLogger.dim(
      `Using stable baseline version ${currentPackageVersion} instead of package.json version ${packageJson.version}.`,
    )
  }
  const repoUrl = await getRepoUrl(cwd)
  const shouldWriteChangelog = canWriteChangelogOnBranch(
    config.changelog?.writeOnBranches,
    currentBranch,
  )

  cliLogger.step(`Branch Policy`)
  cliLogger.item(`${currentBranch}: ${branchReleasePolicy}`)

  cliLogger.step('Synchronizing version state')
  const lastRelease = await getLastReleaseCommit(cwd)
  const commits = await getRawCommits(cwd, lastRelease?.hash)

  if (commits.length === 0) {
    cliLogger.success('No incremental commits found since last release.')
    return
  }

  let bumpType = determineBumpType(commits, config)

  if (!bumpType) {
    const preInfo = semver.prerelease(currentPackageVersion)

    if (preInfo) {
      if (branchReleasePolicy && branchReleasePolicy.startsWith('pre')) {
        cliLogger.success(
          'No incremental changes found in pre-release branch. Skipping.',
        )
        return
      }
      cliLogger.item(
        `No new commits, but promoting pre-release [${currentPackageVersion}] to stable.`,
      )
      bumpType = 'patch'
    } else {
      cliLogger.success('No version-triggering commits found.')
      return
    }
  }

  const semverOrder: Record<string, number> = {
    patch: 1,
    prepatch: 1,
    minor: 2,
    preminor: 2,
    major: 3,
    premajor: 3,
    latest: 4,
  }
  const policyLevel = semverOrder[branchReleasePolicy] || 0
  const bumpLevel = semverOrder[bumpType] || 0

  if (
    policyLevel > 0 &&
    bumpLevel > policyLevel &&
    branchReleasePolicy !== 'latest'
  ) {
    cliLogger.error(
      `[Policy Violation] Branch "${currentBranch}" (Policy: ${branchReleasePolicy}) prohibits ${bumpType.toUpperCase()} changes.`,
    )
    abort(1)
  }

  let targetVersion: string
  const isPrereleasePolicy = branchReleasePolicy.startsWith('pre')
  const prereleaseIdentifier = currentBranch!
  if (isPrereleasePolicy) {
    const isCurrentlyPre = !!semver.prerelease(currentPackageVersion)
    const action = isCurrentlyPre
      ? 'prerelease'
      : (branchReleasePolicy as semver.ReleaseType)
    targetVersion = semver.inc(
      currentPackageVersion,
      action,
      prereleaseIdentifier,
    )!
  } else {
    targetVersion = semver.inc(
      currentPackageVersion,
      bumpType as semver.ReleaseType,
    )!
  }

  cliLogger.item(
    `Current Version: ${cliLogger.highlight(currentPackageVersion)}`,
  )
  cliLogger.item(`Target Version: ${cliLogger.highlight(targetVersion)}`)

  const releaseTag = `v${targetVersion}`
  if (!dry) {
    if (await hasLocalTag(cwd, releaseTag)) {
      cliLogger.error(
        `Tag "${releaseTag}" already exists locally. Stop to avoid ambiguous release state.`,
      )
      abort(1)
    }
    if (await hasRemoteTag(cwd, releaseTag)) {
      cliLogger.error(
        `Tag "${releaseTag}" already exists on origin. Stop to avoid duplicate release.`,
      )
      abort(1)
    }
  }

  const links = createLinkProvider(repoUrl)
  const groups: Record<string, string[]> = {}
  Object.values(config.changelog?.labels || {}).forEach(label => {
    groups[label] = []
  })
  const draftItems: { label: string; hash: string; content: string }[] = []

  commits.forEach(({ message, hash }) => {
    const parsed = parseCommit(message, repoUrl)
    if (!parsed) return

    const {
      type,
      scope,
      subject,
      prLinks,
      linkedIssues,
      isBreaking,
      breakingDetail,
      bodyLines,
    } = parsed

    const label = config.changelog?.labels?.[type]
    if (!label) return

    const commitLink = `[${hash.slice(0, 7)}](${links.commit(hash)})`
    const scopeText = scope ? `**${scope}:** ` : ''
    const breakingTag = isBreaking ? `**[BREAKING CHANGE]** ` : ''

    const prsText = prLinks.length > 0 ? ` ${prLinks.join(' ')}` : ''
    const closesSuffix =
      linkedIssues.length > 0 ? ` (closes ${linkedIssues.join(', ')})` : ''

    let entry = `* ${scopeText}${breakingTag}${subject}${prsText} (${commitLink})${closesSuffix}`

    if (bodyLines.length > 0) {
      entry += `\n  > ${bodyLines
        .map(line => {
          line = line.trim()
          if (line.startsWith('-')) {
            return line.slice(1).trim()
          }
          return line
        })
        .join('\n  \n  > ')}`
    }

    if (breakingDetail) {
      const separator = bodyLines.length > 0 ? '\n  ' : ''
      const detail = breakingDetail.replace(/\n/g, '\n  > ')
      entry += `\n${separator}  > **BREAKING CHANGE:** ${detail}`
    }

    if (!groups[label]) {
      groups[label] = []
    }
    groups[label].push(entry)
    draftItems.push({ label, hash, content: entry })
  })

  let newEntry = ''
  if (shouldWriteChangelog) {
    const existingChangelogRaw = await fs
      .readFile(changelogPath, 'utf-8')
      .catch(() => '')
    const presentShortHashes = extractShortCommitHashes(
      existingChangelogRaw +
        '\n' +
        draftItems.map(item => item.content).join('\n'),
    )

    const draftReadReport = await readChangelogDraftsWithReport(cwd)
    const draftAnalysis = analyzeDraftsForTargetVersion(
      draftReadReport.records,
      targetVersion,
    )
    const draftRecords = draftAnalysis.matching
    if (draftAnalysis.behind.length > 0) {
      cliLogger.warn(
        `Found ${draftAnalysis.behind.length} stale draft(s) behind ${targetVersion}. Run cleanup if they are already merged manually.`,
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
        const shortHash = item.hash.slice(0, 7).toLowerCase()
        if (presentShortHashes.has(shortHash)) continue
        if (!groups[item.label]) groups[item.label] = []
        groups[item.label].push(item.content)
        presentShortHashes.add(shortHash)
        importedCount++
      }

      await removeChangelogDraft(record.filePath)

      if (importedCount > 0) {
        cliLogger.item(
          `Imported ${importedCount} draft changelog item(s) from ${record.draft.branch}@${record.draft.version}`,
        )
      }
    }

    const date = formatDate()
    const compareUrl = links.compare(lastRelease?.version, targetVersion)
    newEntry = `## [${targetVersion}](${compareUrl}) (${date})\n\n`
    for (const [title, items] of Object.entries(groups)) {
      if (items.length > 0)
        newEntry += `### ${title}\n\n${items.join('\n')}\n\n`
    }

    newEntry = await applyContributorsToChangelog(
      newEntry,
      cwd,
      repoUrl,
      lastRelease?.hash,
    )
  }

  if (dry) {
    if (shouldWriteChangelog) {
      cliLogger.warn('DRY RUN: Changelog entry:')
      cliLogger.log(newEntry)
    } else {
      cliLogger.warn('DRY RUN: Changelog draft entry:')
      cliLogger.log(draftItems.map(item => item.content).join('\n'))
      cliLogger.dim(
        `Skipping changelog write on branch "${currentBranch}" due to changelog.writeOnBranches config.`,
      )
    }
    return
  }

  cliLogger.step('Updating Files')
  if (shouldWriteChangelog) {
    cliLogger.item(changelogPath)
  }

  if (shouldWriteChangelog) {
    let currentChangelog = ''
    try {
      currentChangelog = await fs.readFile(changelogPath, 'utf-8')
      const footerChangelog = await archiveChangelogIfNeeded(
        changelogPath,
        currentPackageVersion,
        bumpType,
        isPrereleasePolicy,
      )
      if (footerChangelog) {
        currentChangelog = footerChangelog
      }
    } catch {}

    currentChangelog = cleanupExistingEntry(currentChangelog, targetVersion)

    cliLogger.item(`Updating ${changelogPath}...`)
    await fs.writeFile(
      changelogPath,
      (newEntry + currentChangelog).trim() + '\n',
    )
  } else {
    if (draftItems.length > 0) {
      const draftBranch = currentBranch || 'unknown'
      await writeChangelogDraft(cwd, {
        schemaVersion: 1,
        branch: draftBranch,
        version: targetVersion,
        generatedAt: new Date().toISOString(),
        items: draftItems,
      })
      cliLogger.item(
        `Saved changelog draft for ${draftBranch}@${targetVersion} in .nxspub/changelog-drafts`,
      )
    }
    cliLogger.dim(
      `Skipping changelog write on branch "${currentBranch}" due to changelog.writeOnBranches config.`,
    )
  }

  packageJson.version = targetVersion
  cliLogger.item(`Updating ${pkgPath}...`)

  await writeJSON(pkgPath, packageJson)

  cliLogger.step('Updating lockfile...')
  const installCommand = packageManager.install()
  await run(installCommand.bin, installCommand.args, { cwd })

  if (branchReleasePolicy === 'latest' && currentBranch) {
    await updateStableBranchState(cwd, currentBranch, {
      rootVersion: targetVersion,
    })
  }

  const { stdout: hasChanges } = await runSafe(
    'git',
    ['status', '--porcelain'],
    { cwd },
  )
  if (hasChanges) {
    cliLogger.step('Committing changes...')
    await run('git', ['add', '-A'], { cwd })
    await run('git', ['commit', '-m', `release: v${targetVersion}`], { cwd })

    cliLogger.step('Creating Git Tag...')
    cliLogger.item(releaseTag)

    await run('git', ['tag', releaseTag], { cwd })

    cliLogger.step('Pushing to remote...')

    await run('git', ['push'], { cwd })
    await run('git', ['push', 'origin', `refs/tags/${releaseTag}`], { cwd })

    cliLogger.success(`Successfully released and pushed v${targetVersion}`)
  } else {
    cliLogger.dim('No changes detected, skipping git push.')
  }

  cliLogger.divider()
}
