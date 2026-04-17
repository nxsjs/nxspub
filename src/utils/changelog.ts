import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { BrancheType } from '../config'
import { formatDate } from './date'
import { getContributors } from './git'

/**
 * @en Archiving strategy: Archive when a Major change occurs or when the Changelog file exceeds 1MB.
 * @zh 归档策略：当发生 Major 变更或 Changelog 文件超过 1MB 时进行归档。
 */
export async function archiveChangelogIfNeeded(
  changelogPath: string,
  currentVersion: string,
  bumpType: BrancheType,
  isPreContract: boolean,
): Promise<string | undefined> {
  const PREVIOUS_HEADER = '## Previous Changelogs'
  try {
    const content = await fs.readFile(changelogPath, 'utf-8').catch(() => '')
    if (!content.trim()) return undefined

    const stats = await fs.stat(changelogPath).catch(() => ({ size: 0 }))
    const MAX_SIZE = 1 * 1024 * 1024 // 1MB
    const isTooLarge = stats.size > MAX_SIZE

    if (isPreContract || (bumpType !== 'major' && !isTooLarge)) return undefined

    const mainContent = content.split(PREVIOUS_HEADER)[0].trim()
    if (!mainContent) return undefined

    const changelogsDir = path.join(path.dirname(changelogPath), 'changelogs')
    await fs.mkdir(changelogsDir, { recursive: true })

    const lastMajor = semver.major(currentVersion)
    let counter = 0
    let archiveFileName = `CHANGELOG-v${lastMajor}.x.md`

    while (
      await fs
        .access(path.join(changelogsDir, archiveFileName))
        .then(() => true)
        .catch(() => false)
    ) {
      counter++
      archiveFileName = `CHANGELOG-v${lastMajor}.x-${counter}.md`
    }

    await fs.writeFile(
      path.join(changelogsDir, archiveFileName),
      mainContent + '\n',
    )

    const date = formatDate()
    const partLabel = counter > 0 ? ` (Part ${counter})` : ''
    const newArchiveEntry = `### ${lastMajor}.x${partLabel} (${date})\n\nSee [${lastMajor}.x${partLabel} changelog](./changelogs/${archiveFileName})`

    const oldPrevious = content.includes(PREVIOUS_HEADER)
      ? content.split(PREVIOUS_HEADER)[1].trim()
      : ''
    return `\n${PREVIOUS_HEADER}\n\n${newArchiveEntry}\n\n${oldPrevious}`
  } catch {
    return undefined
  }
}

/**
 * @en Removes existing version entry from changelog content to prevent duplication.
 * @zh 从 Changelog 内容中移除已存在的版本条目，防止重复堆叠。
 */
export function cleanupExistingEntry(content: string, version: string): string {
  const versionHeader = `## [${version}]`

  if (!content.includes(versionHeader)) {
    return content
  }

  const segments = content.split(/^## \[/m)

  return segments
    .filter(s => s && !s.startsWith(`${version}]`))
    .map(s => `## [${s}`)
    .join('')
}

export async function applyContributorsToChangelog(
  newEntry: string,
  repoUrl: string,
  sinceHash?: string,
  pkgPath?: string,
) {
  const { all: allContributors, new: newContributors } = await getContributors(
    sinceHash,
    repoUrl,
    pkgPath,
  )

  if (newContributors.length > 0) {
    newEntry += `### New Contributors\n\n`
    newEntry +=
      newContributors
        .map(c =>
          c.firstPR
            ? `* **[@${c.name}](${c.url})** made their first contribution in [#${c.firstPR?.num}](${c.firstPR?.url})`
            : `* **[@${c.name}](${c.url})** made their first contribution`,
        )
        .join('\n') + '\n\n'
  }

  if (allContributors.length > 0) {
    newEntry += `### Contributors\n\n`
    const avatars = allContributors
      .map(
        c =>
          `<a href="${c.url}"><img src="${c.avatar}" width="32" title="${c.name}"></a>&nbsp;&nbsp;`,
      )
      .join(' ')

    const names = allContributors.map(c => c.name)
    const summary =
      names.length > 3
        ? `${names.slice(0, 3).join(', ')}, and ${names.length - 3} other contributors`
        : names.join(', ')

    newEntry += `<div>${avatars}</div>\n\n${summary}\n\n`
  }
  return newEntry
}
