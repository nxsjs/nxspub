import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { BrancheType } from '../config'
import { formatDate } from './date'

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
