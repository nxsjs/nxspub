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
  getRawCommits,
  getRepoUrl,
  run,
  runSafe,
} from '../utils/git'
import { nxsLog } from '../utils/logger'
import { readJSON, writeJSON } from '../utils/packages'

export async function versionSingle(
  options: { cwd: string; dry?: boolean },
  config: NxspubConfig,
) {
  const { cwd, dry } = options
  const pkgPath = path.resolve(cwd, 'package.json')
  const changelogPath = path.resolve(cwd, 'CHANGELOG.md')
  const changelogsDir = path.resolve(cwd, 'changelogs')

  const currentBranch = await getCurrentBranch()
  const branchContract = getBranchContract(currentBranch!, config.branches)
  if (!branchContract) {
    nxsLog.error(`Admission Denied: Branch "${currentBranch}" not configured.`)
    process.exit(1)
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

  let bumpType: BrancheType | null = null
  const vRules = config.versioning!
  for (const { message } of commits) {
    if (vRules.major?.some(re => new RegExp(re).test(message))) {
      bumpType = 'major'
      break
    }
    if (
      vRules.minor?.some(re => new RegExp(re).test(message)) &&
      (bumpType as any) !== 'major'
    ) {
      bumpType = 'minor'
    }
    if (vRules.patch?.some(re => new RegExp(re).test(message)) && !bumpType) {
      bumpType = 'patch'
    }
  }

  if (!bumpType) {
    nxsLog.success('No version-triggering commits found.')
    return
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
    targetVersion = semver.inc(currentPkgVersion, bumpType)!
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
    const headerMatch = message.match(/^(\w+)(?:\(([^)]+)\))?(!)?:/)
    const type = headerMatch ? headerMatch[1] : ''
    const scope = headerMatch ? headerMatch[2] : ''
    const hasExclamation = !!headerMatch?.[3]

    const breakingMatch = message.match(/BREAKING CHANGE:\s?([\s\S]+)/)
    const breakingDetail = breakingMatch ? breakingMatch[1].trim() : null
    const isBreaking = hasExclamation || !!breakingDetail

    let subject = headerMatch
      ? message.replace(headerMatch[0], '').trim()
      : message

    if (breakingDetail) {
      subject = subject.split(/BREAKING CHANGE:/)[0].trim()
    }

    const label = config.changelog?.labels?.[type]

    if (label) {
      const commitLink = `([${hash.slice(0, 7)}](${repoUrl}/commit/${hash.slice(0, 7)}))`
      const scopeText = scope ? `**${scope}:** ` : ''
      const breakingTag = isBreaking ? `**[BREAKING CHANGE]** ` : ''

      let entry = `* ${scopeText}${breakingTag}${subject} ${commitLink}`

      if (breakingDetail) {
        entry += `\n  > ${breakingDetail.replace(/\n/g, '\n  > ')}`
      }

      groups[label].push(entry)
    }
  })

  let newEntry = `## [${targetVersion}](${compareUrl}) (${date})\n\n`
  for (const [title, items] of Object.entries(groups)) {
    if (items.length > 0) newEntry += `### ${title}\n\n${items.join('\n')}\n\n`
  }

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
  } catch {}
  const PREVIOUS_HEADER = '## Previous Changelogs'

  if (!isPreContract && (bumpType === 'minor' || bumpType === 'major')) {
    nxsLog.step('Archiving stable release...')

    if (
      !(await fs
        .access(changelogsDir)
        .then(() => true)
        .catch(() => false))
    ) {
      nxsLog.item(`Creating directory: ${changelogsDir}`)
      await fs.mkdir(changelogsDir, { recursive: true })
    }

    const mainContent = currentChangelog.split(PREVIOUS_HEADER)[0].trim()

    if (mainContent) {
      const dateMatches = mainContent.match(/\d{4}-\d{2}-\d{2}/g)
      let dateRange = `(${date})`

      if (dateMatches && dateMatches.length > 0) {
        const latestDate = dateMatches[0]
        const earliestDate = dateMatches[dateMatches.length - 1]

        dateRange =
          latestDate === earliestDate
            ? `(${latestDate})`
            : `(${earliestDate} - ${latestDate})`
      }

      const lastVersionBase = `${semver.major(currentPkgVersion)}.${semver.minor(currentPkgVersion)}`
      const archivePath = path.resolve(
        changelogsDir,
        `CHANGELOG-${lastVersionBase}.md`,
      )

      nxsLog.item(`Archiving to: ${archivePath}`)
      await fs.writeFile(archivePath, mainContent + '\n')

      const newArchiveEntry = `### ${lastVersionBase}.x ${dateRange}\n\nSee [${lastVersionBase} changelog](./changelogs/CHANGELOG-${lastVersionBase}.md)`

      const oldPrevious = currentChangelog.includes(PREVIOUS_HEADER)
        ? currentChangelog.split(PREVIOUS_HEADER)[1].trim()
        : ''

      currentChangelog = `\n${PREVIOUS_HEADER}\n\n${newArchiveEntry}\n\n${oldPrevious}`
    }
  }

  const versionHeader = `## [${targetVersion}]`
  if (currentChangelog.includes(versionHeader)) {
    nxsLog.warn(`Overwriting existing entry for ${targetVersion}`)
    const segments = currentChangelog.split(/^## \[/m)
    currentChangelog = segments
      .filter(s => s && !s.startsWith(`${targetVersion}]`))
      .map(s => `## [${s}`)
      .join('')
  }

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
