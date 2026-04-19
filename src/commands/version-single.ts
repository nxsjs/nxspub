import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { NxspubConfig } from '../config'
import { abort } from '../utils/errors'
import {
  applyContributorsToChangelog,
  archiveChangelogIfNeeded,
  cleanupExistingEntry,
  parseCommit,
} from '../utils/changelog'
import { formatDate } from '../utils/date'
import {
  createLinkProvider,
  ensureGitSync,
  resolveBranchType,
  getCurrentBranch,
  getLastReleaseCommit,
  getRawCommits,
  getRepoUrl,
  run,
  runSafe,
} from '../utils/git'
import { cliLogger } from '../utils/logger'
import { detectPackageManager } from '../utils/package-manager'
import { readJSON, writeJSON } from '../utils/packages'
import { determineBumpType } from '../utils/versions'
import type { VersionOptions } from './types'

export async function versionSingle(
  options: VersionOptions,
  config: NxspubConfig,
) {
  const { cwd, dry } = options
  const pkgPath = path.resolve(cwd, 'package.json')
  const changelogPath = path.resolve(cwd, 'CHANGELOG.md')

  const currentBranch = await getCurrentBranch(cwd)
  const branchReleaseType = resolveBranchType(currentBranch!, config.branches)
  if (!branchReleaseType) {
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

  const pkg = await readJSON(pkgPath)
  const packageManager = await detectPackageManager(cwd)
  const currentPkgVersion = pkg.version
  const repoUrl = await getRepoUrl(cwd)

  cliLogger.step(`Branch Contract`)
  cliLogger.item(`${currentBranch}: ${branchReleaseType}`)

  cliLogger.step('Synchronizing version state')
  const lastRelease = await getLastReleaseCommit(cwd)
  const commits = await getRawCommits(cwd, lastRelease?.hash)

  if (commits.length === 0) {
    cliLogger.success('No incremental commits found since last release.')
    return
  }

  let bumpType = determineBumpType(commits, config)

  if (!bumpType) {
    const preInfo = semver.prerelease(currentPkgVersion)

    if (preInfo) {
      if (branchReleaseType && branchReleaseType.startsWith('pre')) {
        cliLogger.success(
          'No incremental changes found in pre-release branch. Skipping.',
        )
        return
      }
      cliLogger.item(
        `No new commits, but promoting pre-release [${currentPkgVersion}] to stable.`,
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
  const contractLevel = semverOrder[branchReleaseType] || 0
  const bumpLevel = semverOrder[bumpType] || 0

  if (
    contractLevel > 0 &&
    bumpLevel > contractLevel &&
    branchReleaseType !== 'latest'
  ) {
    cliLogger.error(
      `[Contract Violation] Branch "${currentBranch}" (Contract: ${branchReleaseType}) prohibits ${bumpType.toUpperCase()} changes.`,
    )
    abort(1)
  }

  let targetVersion: string
  const isPreContract = branchReleaseType.startsWith('pre')
  const preid = currentBranch!
  if (isPreContract) {
    const isCurrentlyPre = !!semver.prerelease(currentPkgVersion)
    const action = isCurrentlyPre
      ? 'prerelease'
      : (branchReleaseType as semver.ReleaseType)
    targetVersion = semver.inc(currentPkgVersion, action, preid)!
  } else {
    targetVersion = semver.inc(
      currentPkgVersion,
      bumpType as semver.ReleaseType,
    )!
  }

  cliLogger.item(`Current Version: ${cliLogger.highlight(currentPkgVersion)}`)
  cliLogger.item(`Target Version: ${cliLogger.highlight(targetVersion)}`)

  const date = formatDate()
  const links = createLinkProvider(repoUrl)
  const compareUrl = links.compare(lastRelease?.version, targetVersion)
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
  })

  let newEntry = `## [${targetVersion}](${compareUrl}) (${date})\n\n`
  for (const [title, items] of Object.entries(groups)) {
    if (items.length > 0) newEntry += `### ${title}\n\n${items.join('\n')}\n\n`
  }

  newEntry = await applyContributorsToChangelog(
    newEntry,
    cwd,
    repoUrl,
    lastRelease?.hash,
  )

  if (dry) {
    cliLogger.warn('DRY RUN: Changelog entry:')
    cliLogger.log(newEntry)
    return
  }

  cliLogger.step('Updating Files')
  cliLogger.item(changelogPath)

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
  cliLogger.item(`Updating ${pkgPath}...`)

  await writeJSON(pkgPath, pkg)
  cliLogger.item(`Updating ${changelogPath}...`)
  await fs.writeFile(changelogPath, (newEntry + currentChangelog).trim() + '\n')

  cliLogger.step('Updating lockfile...')
  const installCommand = packageManager.install()
  await run(installCommand.bin, installCommand.args, { cwd })

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
    cliLogger.item(`v${targetVersion}`)

    await run('git', ['tag', `v${targetVersion}`], { cwd })

    cliLogger.step('Pushing to remote...')

    await run('git', ['push', 'origin', `refs/tags/v${targetVersion}`], { cwd })

    await run('git', ['push'], { cwd })

    cliLogger.success(`Successfully released and pushed v${targetVersion}`)
  } else {
    cliLogger.dim('No changes detected, skipping git push.')
  }

  cliLogger.divider()
}
