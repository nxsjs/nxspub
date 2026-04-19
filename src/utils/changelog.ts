import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { BranchType } from '../config'
import { formatDate } from './date'
import { createLinkProvider, getContributors } from './git'

/**
 * @en Archiving strategy: Archive when a Major change occurs or when the Changelog file exceeds 1MB.
 * @zh 归档策略：当发生 Major 变更或 Changelog 文件超过 1MB 时进行归档。
 */
export async function archiveChangelogIfNeeded(
  changelogPath: string,
  currentVersion: string,
  bumpType: BranchType,
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
  cwd: string,
  repoUrl: string,
  sinceHash?: string,
  pkgPath?: string,
) {
  const { all: allContributors, new: newContributors } = await getContributors(
    cwd,
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

/**
 * @en Structured data of a parsed commit message.
 * @zh 解析后的提交信息结构化数据。
 */
interface ParsedCommit {
  /** @en Type of the commit (e.g., 'feat', 'fix', 'chore'). @zh 提交的类型（例如 'feat', 'fix', 'chore'）。 */
  type: string
  /** @en Optional scope of the commit (e.g., 'ui', 'api'). @zh 提交的可选范围（例如 'ui', 'api'）。 */
  scope: string
  /** @en Subject of the commit with issue IDs linked. @zh 已处理 Issue 链接的提交主题。 */
  subject: string
  /** @en Array of Markdown links to the associated PRs. @zh 关联 PR 的 Markdown 链接数组。 */
  prLinks: string[]
  /** @en Array of Markdown links to the associated issues from the body. @zh 从正文中提取的关联 Issue 的 Markdown 链接数组。 */
  linkedIssues: string[]
  /** @en Whether the commit contains a breaking change. @zh 提交是否包含重大变更。 */
  isBreaking: boolean
  /** @en Detailed description of the breaking change, if any. @zh 重大变更的详细描述（如果有）。 */
  breakingDetail: string | null
  /** @en Descriptive lines from the body, excluding action and breaking change lines. @zh 正文中的描述性行，不包括关联 Issue 和重大变更行。 */
  bodyLines: string[]
}

/**
 * @en Deeply parses a single commit message into structured data, supporting multiple PRs and complex issue linking.
 * @zh 深度解析单条提交信息为结构化数据，支持多个 PR 和复杂的 Issue 关联逻辑。
 *
 * @param message
 * @en Raw commit message (header + body)
 * @zh 原始提交信息（标题 + 正文）
 *
 * @param repoUrl
 * @en Base URL of the repository (e.g., 'https://github.com/user/repo')
 * @zh 仓库的基础 URL。
 *
 * @returns
 * @en Parsed data or null if the header format is invalid
 * @zh 解析后的数据，如果标题格式无效则返回 null
 */
export function parseCommit(
  message: string,
  repoUrl: string,
): ParsedCommit | null {
  const lines = message
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return null

  const header = lines[0]
  // Match Conventional Commits: type(scope)!: subject
  const headerMatch = header.match(/^(\w+)(?:\(([^)]+)\))?(!)?:/)
  if (!headerMatch) return null

  const [fullMatch, type, scope, exclamation] = headerMatch
  let subject = header.replace(fullMatch, '').trim()

  // Extract and strip all PR references (e.g., "feat: add (#1) (#3)")
  // 提取并剥离所有 PR 引用（支持多个，例如 "feat: add (#1) (#3)"）
  const prLinks: string[] = []
  const PR_EXTRACT_REGEX = /\s\(#(\d+)\)/g
  const links = createLinkProvider(repoUrl)

  subject = subject
    .replace(PR_EXTRACT_REGEX, (_, prNumber) => {
      prLinks.push(`([#${prNumber}](${links.pr(prNumber)}))`)
      return ''
    })
    .trim()

  // Transform remaining generic #ID in subject to issue links
  // 将主题中剩余的普通 #ID 转换为 Issue 链接
  subject = subject.replace(/#(\d+)/g, (_, id: string) => {
    return `[#${id}](${links.issue(id)})`
  })

  // Extract linked issues from the entire message (supports multiple IDs: closes #12 #45)
  // 从整个信息中提取关联 Issue（支持一行多个：closes #12 #45）
  const linkedIssues = new Set<string>()
  const ACTION_BLOCK_REGEX =
    /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+((?:#\d+[\s,，]*)+)/gi

  let blockMatch
  while ((blockMatch = ACTION_BLOCK_REGEX.exec(message)) !== null) {
    const idsText = blockMatch[1]
    const ids = idsText.match(/#(\d+)/g)
    if (ids) {
      ids.forEach(idStr => {
        const id = idStr.replace(/\D/g, '')
        linkedIssues.add(`[#${id}](${links.issue(id)})`)
      })
    }
  }

  // Parse Breaking Changes
  // 解析重大变更（Breaking Changes）
  const breakingMatch = message.match(/BREAKING CHANGE:\s?([\s\S]+)/i)
  const breakingDetail = breakingMatch ? breakingMatch[1].trim() : null
  const isBreaking = !!exclamation || !!breakingDetail

  // Extract descriptive Body (filter out already extracted action lines and breaking change headers)
  // 提取描述性正文（过滤掉已提取的关联行和重大变更标题行）
  const bodyLines = lines.slice(1).filter(line => {
    const isBreakingLine = /BREAKING CHANGE:/i.test(line)
    // If the line contains an action keyword followed by an ID, we treat it as a metadata line
    const isActionLine =
      /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+.*#\d+/i.test(
        line,
      )
    if (isActionLine) return false
    return !isBreakingLine && !isActionLine
  })

  return {
    type,
    scope: scope || '',
    subject,
    prLinks,
    linkedIssues: Array.from(linkedIssues),
    isBreaking,
    breakingDetail,
    bodyLines,
  }
}
