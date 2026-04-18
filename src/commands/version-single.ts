import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { NxspubConfig } from '../config'
import {
  applyContributorsToChangelog,
  archiveChangelogIfNeeded,
  cleanupExistingEntry,
  parseCommit,
} from '../utils/changelog'
import { formatDate } from '../utils/date'
import {
  ensureGitSync,
  getBranchContract,
  getCompareUrl,
  getCurrentBranch,
  getLastReleaseCommit,
  getRawCommits,
  getRepoUrl,
  run,
  runSafe,
} from '../utils/git'
import { nxsLog } from '../utils/logger'
import { readJSON, writeJSON } from '../utils/packages'
import { determineBumpType } from '../utils/versions'

export async function versionSingle(
  options: { cwd: string; dry?: boolean },
  config: NxspubConfig,
) {
  const { cwd, dry } = options
  const pkgPath = path.resolve(cwd, 'package.json')
  const changelogPath = path.resolve(cwd, 'CHANGELOG.md')

  const currentBranch = await getCurrentBranch()
  const branchContract = getBranchContract(currentBranch!, config.branches)
  if (!branchContract) {
    nxsLog.error(`Admission Denied: Branch "${currentBranch}" not configured.`)
    process.exit(1)
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
    nxsLog.error('package.json not found.')
    return
  }

  const pkg = await readJSON(pkgPath)
  const currentPkgVersion = pkg.version
  const repoUrl = await getRepoUrl()

  nxsLog.step(`Branch Contract`)
  nxsLog.item(`${currentBranch}: ${branchContract}`)

  nxsLog.step('Synchronizing version state')
  const lastRelease = await getLastReleaseCommit()
  const commits = await getRawCommits(lastRelease?.hash)

  if (commits.length === 0) {
    nxsLog.success('No incremental commits found since last release.')
    return
  }

  let bumpType = determineBumpType(commits, config)

  if (!bumpType) {
    const preInfo = semver.prerelease(currentPkgVersion)

    if (preInfo) {
      if (branchContract && branchContract.startsWith('pre')) {
        nxsLog.success(
          'No incremental changes found in pre-release branch. Skipping.',
        )
        return
      }
      nxsLog.item(
        `No new commits, but promoting pre-release [${currentPkgVersion}] to stable.`,
      )
      bumpType = 'patch'
    } else {
      nxsLog.success('No version-triggering commits found.')
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
  const contractLevel = semverOrder[branchContract] || 0
  const bumpLevel = semverOrder[bumpType] || 0

  if (
    contractLevel > 0 &&
    bumpLevel > contractLevel &&
    branchContract !== 'latest'
  ) {
    nxsLog.error(
      `[Contract Violation] Branch "${currentBranch}" (Contract: ${branchContract}) prohibits ${bumpType.toUpperCase()} changes.`,
    )
    process.exit(1)
  }

  let targetVersion: string
  const isPreContract = branchContract.startsWith('pre')
  const preid = currentBranch!
  if (isPreContract) {
    const isCurrentlyPre = !!semver.prerelease(currentPkgVersion)
    const action = isCurrentlyPre
      ? 'prerelease'
      : (branchContract as semver.ReleaseType)
    targetVersion = semver.inc(currentPkgVersion, action, preid)!
  } else {
    targetVersion = semver.inc(
      currentPkgVersion,
      bumpType as semver.ReleaseType,
    )!
  }

  nxsLog.item(`Current Version: ${nxsLog.highlight(currentPkgVersion)}`)
  nxsLog.item(`Target Version: ${nxsLog.highlight(targetVersion)}`)

  const date = formatDate()
  const compareUrl = getCompareUrl(repoUrl, lastRelease?.version, targetVersion)
  const groups: Record<string, string[]> = {}
  Object.values(config.changelog?.labels || {}).forEach(label => {
    groups[label] = []
  })

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

    const commitLink = `[${hash.slice(0, 7)}](${repoUrl}/commit/${hash})`
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
        .join('\n  > \n  > ')}`
    }

    if (breakingDetail) {
      const separator = bodyLines.length > 0 ? '\n  > ' : ''
      const detail = breakingDetail.replace(/\n/g, '\n  > ')
      entry += `\n  > ${separator}**BREAKING CHANGE:** ${detail}`
    }

    if (!groups[label]) {
      groups[label] = []
    }
    groups[label].push(entry)
  })

  let newEntry = `## [${targetVersion}](${compareUrl}) (${date})\n\n`
  for (const [title, items] of Object.entries(groups)) {
    if (items.length > 0) newEntry += `### ${title}\n\n${items.join('\n')}\n\n`
  }

  newEntry = await applyContributorsToChangelog(
    newEntry,
    repoUrl,
    lastRelease?.hash,
  )

  if (dry) {
    nxsLog.warn('DRY RUN: Changelog entry:')
    nxsLog.log(newEntry)
    return
  }

  nxsLog.step('Updating Files')
  nxsLog.item(changelogPath)

  let currentChangelog = ''
  try {
    currentChangelog = await fs.readFile(changelogPath, 'utf-8')
    const footerChangelog = await archiveChangelogIfNeeded(
      changelogPath,
      currentPkgVersion,
      bumpType,
      isPreContract,
    )
    if (footerChangelog) {
      currentChangelog = footerChangelog
    }
  } catch {}

  currentChangelog = cleanupExistingEntry(currentChangelog, targetVersion)

  pkg.version = targetVersion
  nxsLog.item(`Updating ${pkgPath}...`)

  await writeJSON(pkgPath, pkg)
  nxsLog.item(`Updating ${changelogPath}...`)
  await fs.writeFile(changelogPath, (newEntry + currentChangelog).trim() + '\n')

  nxsLog.step('Updating lockfile...')
  await run('pnpm', ['install', '--prefer-offline'], { cwd })

  const { stdout: hasChanges } = await runSafe(
    'git',
    ['status', '--porcelain'],
    { cwd },
  )
  if (hasChanges) {
    nxsLog.step('Committing changes...')
    await run('git', ['add', '-A'], { cwd })
    await run('git', ['commit', '-m', `release: v${targetVersion}`], { cwd })

    nxsLog.step('Creating Git Tag...')
    nxsLog.item(`v${targetVersion}`)

    await run('git', ['tag', `v${targetVersion}`], { cwd })

    nxsLog.step('Pushing to remote...')

    await run('git', ['push', 'origin', `refs/tags/v${targetVersion}`], { cwd })

    await run('git', ['push'], { cwd })

    nxsLog.success(`Successfully released and pushed v${targetVersion}`)
  } else {
    nxsLog.dim('No changes detected, skipping git push.')
  }

  nxsLog.divider()
}
