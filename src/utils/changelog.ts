import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { BranchType } from '../config'
import { formatDate } from './date'
import { createLinkProvider, getContributors } from './git'

/**
 * @en Archiving strategy: Archive when a Major change occurs or when the Changelog file exceeds 1MB.
 * @zh 归档策略：当发生 Major 变更或 Changelog 文件超过 1MB 时进行归档。
 *
 * @param changelogPath
 * @en Absolute path to CHANGELOG.md.
 * @zh CHANGELOG.md 的绝对路径。
 *
 * @param currentVersion
 * @en Current package version.
 * @zh 当前包版本。
 *
 * @param bumpType
 * @en Computed semantic bump type.
 * @zh 计算出的语义化升级类型。
 *
 * @param isPrereleasePolicy
 * @en Whether current branch policy is prerelease.
 * @zh 当前分支策略是否为预发布策略。
 *
 * @returns
 * @en Archived footer content when archived, otherwise undefined.
 * @zh 发生归档时返回新的归档尾部内容，否则返回 undefined。
 */
export async function archiveChangelogIfNeeded(
  changelogPath: string,
  currentVersion: string,
  bumpType: BranchType,
  isPrereleasePolicy: boolean,
): Promise<string | undefined> {
  const PREVIOUS_HEADER = '## Previous Changelogs'
  try {
    const content = await fs.readFile(changelogPath, 'utf-8').catch(() => '')
    if (!content.trim()) return undefined

    const stats = await fs.stat(changelogPath).catch(() => ({ size: 0 }))
    const MAX_SIZE = 1 * 1024 * 1024 // 1MB
    const isTooLarge = stats.size > MAX_SIZE

    if (isPrereleasePolicy || (bumpType !== 'major' && !isTooLarge))
      return undefined

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
 *
 * @param content
 * @en Existing changelog content.
 * @zh 现有 changelog 内容。
 *
 * @param version
 * @en Target version to remove before inserting a regenerated entry.
 * @zh 插入新条目前需要移除的目标版本号。
 *
 * @returns
 * @en Cleaned changelog content.
 * @zh 清理后的 changelog 内容。
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

/**
 * @en Append contributor sections to generated changelog entry.
 * @zh 为生成的 changelog 条目追加贡献者信息区块。
 *
 * @param newEntry
 * @en Generated changelog entry content.
 * @zh 生成后的 changelog 条目内容。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @param repoUrl
 * @en Repository URL used for profile and PR links.
 * @zh 用于用户与 PR 链接的仓库地址。
 *
 * @param sinceHash
 * @en Optional starting commit hash.
 * @zh 可选的起始提交哈希。
 *
 * @param pkgPath
 * @en Optional package path filter for workspace mode.
 * @zh 工作区模式下可选的包路径过滤。
 *
 * @returns
 * @en Changelog entry with contributor sections.
 * @zh 追加贡献者区块后的 changelog 条目。
 */
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
 * @en Decide whether changelog files should be written on current branch.
 * @zh 判断当前分支是否允许写入 changelog 文件。
 *
 * @param writeOnBranches
 * @en Optional branch allowlist from config.
 * @zh 配置中的可选分支白名单。
 *
 * @param currentBranch
 * @en Current git branch name.
 * @zh 当前 Git 分支名。
 *
 * @returns
 * @en True when changelog writing is allowed.
 * @zh 允许写入 changelog 时返回 true。
 */
export function canWriteChangelogOnBranch(
  writeOnBranches: string[] | undefined,
  currentBranch: string | undefined,
): boolean {
  if (!writeOnBranches) return true
  if (writeOnBranches.length === 0) return false
  if (!currentBranch) return false
  return writeOnBranches.includes(currentBranch)
}

/**
 * @en A normalized changelog draft item.
 * @zh 标准化的 changelog 草稿条目。
 */
export interface ChangelogDraftItem {
  /** @en Label key used for section grouping. @zh 用于分组的标签键。 */
  label: string
  /** @en Commit hash related to the item. @zh 与条目关联的提交哈希。 */
  hash: string
  /** @en Rendered markdown content line/block. @zh 已渲染的 Markdown 内容行/块。 */
  content: string
}

/**
 * @en Changelog draft file model persisted in repository.
 * @zh 持久化在仓库中的 changelog 草稿文件模型。
 */
export interface ChangelogDraft {
  /** @en Schema version for forward compatibility. @zh 用于前向兼容的结构版本。 */
  schemaVersion: 1
  /** @en Source branch name that generated the draft. @zh 生成草稿的源分支名。 */
  branch: string
  /** @en Version string produced on source branch. @zh 源分支产出的版本号。 */
  version: string
  /** @en Timestamp string when draft was generated. @zh 草稿生成时间戳字符串。 */
  generatedAt: string
  /** @en Draft items to merge into target changelog. @zh 待合并到目标 changelog 的草稿条目。 */
  items: ChangelogDraftItem[]
}

/**
 * @en Changelog draft loaded from file system with file path.
 * @zh 从文件系统读取并带文件路径的 changelog 草稿。
 */
export interface ChangelogDraftRecord {
  /** @en Absolute file path of the draft json file. @zh 草稿 JSON 文件的绝对路径。 */
  filePath: string
  /** @en Parsed draft payload. @zh 解析后的草稿内容。 */
  draft: ChangelogDraft
}

/**
 * @en Partition draft records by their relation to target stable version.
 * @zh 按与目标稳定版本的关系对草稿记录进行分组。
 */
export interface DraftImportAnalysis {
  /** @en Drafts whose core version equals the target version. @zh 核心版本与目标版本一致的草稿。 */
  matching: ChangelogDraftRecord[]
  /** @en Drafts whose core version is lower than target version. @zh 核心版本低于目标版本的草稿。 */
  behind: ChangelogDraftRecord[]
  /** @en Drafts whose core version is higher than target version. @zh 核心版本高于目标版本的草稿。 */
  ahead: ChangelogDraftRecord[]
  /** @en Drafts that cannot be compared semantically. @zh 无法进行语义化版本比较的草稿。 */
  invalid: ChangelogDraftRecord[]
}

function getDraftDir(cwd: string, branch: string) {
  const safeBranch = branch.replace(/[^\w.-]+/g, '_')
  return path.join(cwd, '.nxspub', 'changelog-drafts', safeBranch)
}

function getCoreVersion(version: string): string {
  const prereleaseIndex = version.indexOf('-')
  return prereleaseIndex === -1 ? version : version.slice(0, prereleaseIndex)
}

/**
 * @en Extract short commit hashes referenced in changelog markdown.
 * @zh 提取 changelog Markdown 中引用的短提交哈希。
 *
 * @param content
 * @en Changelog markdown content.
 * @zh Changelog 的 Markdown 内容。
 *
 * @returns
 * @en Set of 7-char short hashes.
 * @zh 7 位短哈希集合。
 */
export function extractShortCommitHashes(content: string): Set<string> {
  const hashes = new Set<string>()
  const regex = /\[([0-9a-f]{7})\]\(/gi
  let match: RegExpExecArray | null = null
  while ((match = regex.exec(content)) !== null) {
    hashes.add(match[1].toLowerCase())
  }
  return hashes
}

/**
 * @en Persist changelog draft json for non-write branches.
 * @zh 为非写入分支持久化 changelog 草稿 JSON。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @param draft
 * @en Draft payload to persist.
 * @zh 需要持久化的草稿内容。
 *
 * @returns
 * @en Absolute path of persisted draft file.
 * @zh 持久化后的草稿文件绝对路径。
 */
export async function writeChangelogDraft(
  cwd: string,
  draft: ChangelogDraft,
): Promise<string> {
  const draftDir = getDraftDir(cwd, draft.branch)
  await fs.mkdir(draftDir, { recursive: true })
  const filePath = path.join(draftDir, `${draft.version}.json`)
  await fs.writeFile(filePath, JSON.stringify(draft, null, 2) + '\n', 'utf-8')
  return filePath
}

/**
 * @en Read all changelog draft json files from workspace.
 * @zh 读取工作区下所有 changelog 草稿 JSON 文件。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @returns
 * @en Parsed draft records.
 * @zh 解析后的草稿记录列表。
 */
export async function readChangelogDrafts(
  cwd: string,
): Promise<ChangelogDraftRecord[]> {
  const rootDir = path.join(cwd, '.nxspub', 'changelog-drafts')
  try {
    const branchDirs = await fs.readdir(rootDir, { withFileTypes: true })
    const records: ChangelogDraftRecord[] = []

    for (const branchDir of branchDirs) {
      if (!branchDir.isDirectory()) continue
      const branchPath = path.join(rootDir, branchDir.name)
      const files = await fs.readdir(branchPath, { withFileTypes: true })
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.json')) continue
        const filePath = path.join(branchPath, file.name)
        try {
          const raw = await fs.readFile(filePath, 'utf-8')
          const draft = JSON.parse(raw) as ChangelogDraft
          const normalizedItems = Array.isArray(draft?.items)
            ? draft.items.filter(
                item =>
                  item &&
                  typeof item.label === 'string' &&
                  item.label.length > 0 &&
                  typeof item.hash === 'string' &&
                  item.hash.length > 0 &&
                  typeof item.content === 'string' &&
                  item.content.length > 0,
              )
            : []
          if (
            draft &&
            draft.schemaVersion === 1 &&
            typeof draft.branch === 'string' &&
            typeof draft.version === 'string' &&
            normalizedItems.length > 0
          ) {
            records.push({
              filePath,
              draft: {
                ...draft,
                items: normalizedItems,
              },
            })
          }
        } catch {
          // ignore malformed draft files
        }
      }
    }

    return records
  } catch {
    return []
  }
}

/**
 * @en Filter drafts matching a target stable version core.
 * @zh 按目标稳定版本核心号筛选草稿。
 *
 * @param drafts
 * @en Candidate draft records.
 * @zh 候选草稿记录。
 *
 * @param targetVersion
 * @en Target release version on current branch.
 * @zh 当前分支的目标发布版本。
 *
 * @returns
 * @en Drafts whose core version equals target version.
 * @zh 核心版本与目标版本一致的草稿。
 */
export function filterDraftsForTargetVersion(
  drafts: ChangelogDraftRecord[],
  targetVersion: string,
): ChangelogDraftRecord[] {
  return analyzeDraftsForTargetVersion(drafts, targetVersion).matching
}

/**
 * @en Analyze draft records and classify them against target stable version.
 * @zh 分析草稿记录并按目标稳定版本进行分类。
 *
 * @param drafts
 * @en Candidate draft records.
 * @zh 候选草稿记录。
 *
 * @param targetVersion
 * @en Target stable version on current branch.
 * @zh 当前分支的目标稳定版本。
 *
 * @returns
 * @en Classified draft records for import/governance decisions.
 * @zh 用于导入与治理决策的草稿分类结果。
 */
export function analyzeDraftsForTargetVersion(
  drafts: ChangelogDraftRecord[],
  targetVersion: string,
): DraftImportAnalysis {
  const matching: ChangelogDraftRecord[] = []
  const behind: ChangelogDraftRecord[] = []
  const ahead: ChangelogDraftRecord[] = []
  const invalid: ChangelogDraftRecord[] = []

  if (!semver.valid(targetVersion)) {
    return { matching: [], behind: [], ahead: [], invalid: drafts }
  }

  for (const record of drafts) {
    const coreVersion = getCoreVersion(record.draft.version)
    if (!semver.valid(coreVersion)) {
      invalid.push(record)
      continue
    }
    if (coreVersion === targetVersion) {
      matching.push(record)
      continue
    }
    if (semver.lt(coreVersion, targetVersion)) {
      behind.push(record)
      continue
    }
    if (semver.gt(coreVersion, targetVersion)) {
      ahead.push(record)
      continue
    }
    invalid.push(record)
  }

  return { matching, behind, ahead, invalid }
}

/**
 * @en Delete a consumed changelog draft file.
 * @zh 删除已消费的 changelog 草稿文件。
 *
 * @param filePath
 * @en Absolute draft file path.
 * @zh 草稿文件绝对路径。
 *
 * @returns
 * @en Resolves when file deletion is attempted.
 * @zh 尝试删除文件后返回。
 */
export async function removeChangelogDraft(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch {
    // ignore
  }
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
