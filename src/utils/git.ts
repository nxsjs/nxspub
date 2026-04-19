import { execa } from 'execa'
import { createHash } from 'node:crypto'
import type { BranchType } from '../config'
import { abort } from './errors'
import { cliLogger } from './logger'
import { normalizeRegExp } from './regexp'

/**
 * @en Execute a command and inherit stdio (suitable for interactive commands).
 * @zh 执行命令并继承标准输入输出（适用于交互式命令）。
 *
 * @param bin
 * @en Executable binary name.
 * @zh 可执行命令名。
 *
 * @param args
 * @en Command arguments.
 * @zh 命令参数数组。
 *
 * @param opts
 * @en Additional execa options.
 * @zh 额外 execa 参数。
 *
 * @returns
 * @en Execa promise object.
 * @zh Execa Promise 对象。
 */
export const run = (bin: string, args: string[], opts = {}) =>
  execa(bin, args, { stdio: 'inherit', ...opts })

/**
 * @en Execute a command and capture output (suitable for background logic).
 * @zh 执行命令并捕获输出（适用于后台逻辑计算）。
 *
 * @param bin
 * @en Executable binary name.
 * @zh 可执行命令名。
 *
 * @param args
 * @en Command arguments.
 * @zh 命令参数数组。
 *
 * @param opts
 * @en Additional execa options.
 * @zh 额外 execa 参数。
 *
 * @returns
 * @en Execa promise object.
 * @zh Execa Promise 对象。
 */
export const runSafe = (bin: string, args: string[], opts = {}) =>
  execa(bin, args, { ...opts })

/**
 * @en Parse one git log record line split by the first pipe symbol.
 * @zh 按第一个竖线分隔并解析单条 Git 日志记录。
 *
 * @param line
 * @en Raw git log line in `<hash>|<message>` format.
 * @zh `<hash>|<message>` 格式的原始日志行。
 *
 * @returns
 * @en Parsed commit hash and message.
 * @zh 解析后的提交哈希与消息。
 */
export function parseGitLogRecord(line: string) {
  const firstPipeIndex = line.indexOf('|')
  if (firstPipeIndex === -1) {
    return { hash: line.trim(), message: '' }
  }

  return {
    hash: line.slice(0, firstPipeIndex).trim(),
    message: line.slice(firstPipeIndex + 1).trim(),
  }
}

function splitContributorRecord(line: string) {
  const firstPipeIndex = line.indexOf('|')
  const secondPipeIndex =
    firstPipeIndex === -1 ? -1 : line.indexOf('|', firstPipeIndex + 1)
  const thirdPipeIndex =
    secondPipeIndex === -1 ? -1 : line.indexOf('|', secondPipeIndex + 1)

  if (firstPipeIndex === -1 || secondPipeIndex === -1 || thirdPipeIndex === -1)
    return null

  return {
    hash: line.slice(0, firstPipeIndex).trim(),
    name: line.slice(firstPipeIndex + 1, secondPipeIndex).trim(),
    email: line.slice(secondPipeIndex + 1, thirdPipeIndex).trim(),
    subject: line.slice(thirdPipeIndex + 1).trim(),
  }
}

/**
 * @en Get the remote origin repository URL and normalize it for private/IP-based GitLab.
 * @zh 获取远程仓库地址并规范化，适配包含 IP、端口及不同协议的私有 GitLab。
 */
export async function getRepoUrl(cwd: string = process.cwd()) {
  try {
    const { stdout } = await execa('git', ['remote', 'get-url', 'origin'], {
      cwd,
    })
    let rawUrl = stdout.trim()

    let normalizedUrl: string

    if (rawUrl.startsWith('git@')) {
      const sshContent = rawUrl.replace(/^git@/, '')

      const firstColonIndex = sshContent.indexOf(':')

      if (firstColonIndex !== -1) {
        const hostPart = sshContent.slice(0, firstColonIndex)
        const pathPart = sshContent.slice(firstColonIndex + 1)

        normalizedUrl = `https://${hostPart}/${pathPart}`
      } else {
        normalizedUrl = `https://${sshContent}`
      }
    } else {
      normalizedUrl = rawUrl
    }

    const urlObj = new URL(
      normalizedUrl.startsWith('http')
        ? normalizedUrl
        : `https://${normalizedUrl}`,
    )

    const protocol = urlObj.protocol
    const host = urlObj.host
    const pathname = urlObj.pathname.replace(/\.git$/, '').replace(/\/$/, '')

    return `${protocol}//${host}${pathname}`
  } catch {
    return 'https://github.com/nxsjs/nxspub'
  }
}

/**
 * @en Get incremental commit records with "Side-chain Penetration".
 * This logic identifies Merge Commits and extracts commits from the merged branch
 * to ensure no semantic information (feat/fix) is lost.
 * @zh 获取增量提交记录（具备“侧链穿透”能力）。
 * 该逻辑能识别合并节点并提取侧链上的提交，确保不会丢失合并分支内部的语义信息。
 */
export async function getRawCommits(cwd: string, from?: string) {
  const args = ['log', '--first-parent', '--pretty=format:%H|%B\x1e']

  if (from) args.push(`${from}..HEAD`)

  try {
    const { stdout } = await execa('git', args, { cwd })
    const mainLineCommits = stdout.split('\x1e').filter(Boolean)

    let allCommits: { message: string; hash: string }[] = []

    for (const line of mainLineCommits) {
      const { hash, message: subject } = parseGitLogRecord(line)
      const { stdout: parents } = await execa(
        'git',
        ['show', '--summary', '--format=%P', '-s', hash],
        { cwd },
      )
      const parentHashes = parents.trim().split(/\s+/)

      if (parentHashes.length > 1) {
        const { stdout: sideCommitsRaw } = await execa(
          'git',
          [
            'log',
            `${parentHashes[0]}..${parentHashes[1]}`,
            '--pretty=format:%H|%B\x1e',
          ],
          { cwd },
        )

        const sideCommits = sideCommitsRaw
          .split('\x1e')
          .filter(Boolean)
          .map(parseGitLogRecord)

        const lastReleaseIndex = sideCommits.findIndex(c =>
          /^release(\(.*\))?:/i.test(c.message),
        )

        if (lastReleaseIndex !== -1) {
          const validSideCommits = sideCommits.slice(0, lastReleaseIndex)
          allCommits.push(...validSideCommits)
        } else {
          allCommits.push(...sideCommits)
        }

        allCommits.push({ message: subject, hash })
      } else {
        allCommits.push({ message: subject, hash })
      }
    }

    return allCommits
  } catch (e) {
    cliLogger.error(JSON.stringify(e))
    return []
  }
}

/**
 * @en Find the most recent release commit on the current branch's mainline.
 * @zh 在当前分支的主干线上查找最近一次发布的提交记录。
 */
export async function getLastReleaseCommit(cwd: string) {
  try {
    const { stdout } = await execa(
      'git',
      [
        'log',
        '--first-parent',
        '--grep=^release\(.*\)\?:',
        '-n',
        '1',
        '--pretty=format:%H|%B',
        '--extended-regexp',
      ],
      { cwd },
    )
    if (!stdout) return null

    const firstPipeIndex = stdout.indexOf('|')
    const hash = stdout.slice(0, firstPipeIndex)
    const releaseCommitMessage = stdout.slice(firstPipeIndex + 1)

    const mainVersionMatch = releaseCommitMessage.match(/v(\d+\.\d+\.\d+)/)
    const version = mainVersionMatch ? mainVersionMatch[1] : 'unknown'

    const workspacePackages: {
      name: string
      version: string
      private: boolean
    }[] = []

    const packageLineRegex =
      /^- (@?[^\s@/]+(?:\/[^\s@/]+)?)@([\d.]+[\w.-]*)(?:\s*(\(private\)))?/gm

    let match
    while ((match = packageLineRegex.exec(releaseCommitMessage)) !== null) {
      workspacePackages.push({
        name: match[1],
        version: match[2],
        private: !!match[3],
      })
    }

    return {
      hash,
      version,
      workspacePackages,
    }
  } catch {
    return null
  }
}

/**
 * @en Get the current branch name.
 * @zh 获取当前分支名称。
 */
export async function getCurrentBranch(
  cwd: string = process.cwd(),
): Promise<string | undefined> {
  const env = process.env

  if (env.GITHUB_REF_TYPE === 'branch') {
    return env.GITHUB_REF_NAME
  }

  const possibleCIBranch =
    env.CI_COMMIT_REF_NAME || // GitLab
    env.VERCEL_GIT_COMMIT_REF || // Vercel
    env.CIRCLE_BRANCH || // CircleCI
    env.GITHUB_HEAD_REF // GitHub PR (Head branch)

  if (possibleCIBranch && possibleCIBranch !== 'HEAD') {
    return possibleCIBranch
  }

  try {
    const { stdout } = await execa(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd },
    )
    const result = stdout.trim()
    if (result && result !== 'HEAD') return result
  } catch (error) {
    if (process.env.NXSPUB_DEBUG) {
      cliLogger.dim(
        `Failed to detect current branch from git: ${String(error)}`,
      )
    }
  }

  return undefined
}

/**
 * @en Check whether a local git tag already exists.
 * @zh 检查本地 Git Tag 是否已存在。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @param tagName
 * @en Full tag name to verify.
 * @zh 需要校验的完整 Tag 名称。
 *
 * @returns
 * @en True when tag exists locally.
 * @zh 本地存在该 Tag 时返回 true。
 */
export async function hasLocalTag(
  cwd: string,
  tagName: string,
): Promise<boolean> {
  try {
    await runSafe(
      'git',
      ['rev-parse', '-q', '--verify', `refs/tags/${tagName}`],
      {
        cwd,
      },
    )
    return true
  } catch {
    return false
  }
}

/**
 * @en Check whether a remote git tag already exists on origin.
 * @zh 检查远程 origin 上是否已存在指定 Git Tag。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @param tagName
 * @en Full tag name to verify.
 * @zh 需要校验的完整 Tag 名称。
 *
 * @returns
 * @en True when tag exists on remote origin.
 * @zh 远程 origin 存在该 Tag 时返回 true。
 */
export async function hasRemoteTag(
  cwd: string,
  tagName: string,
): Promise<boolean> {
  const { stdout } = await runSafe(
    'git',
    ['ls-remote', '--tags', 'origin', `refs/tags/${tagName}`],
    { cwd },
  )
  return stdout.trim().length > 0
}

/**
 * @en Matches the current branch against configured patterns to determine the release type.
 * @zh 将当前分支与配置的模式进行匹配，以确定发布类型。
 *
 * @param branch
 * @en The name of the current git branch
 * @zh 当前 Git 分支名称
 *
 * @param branches
 * @en Mapping of branch patterns (string or regex) to release types
 * @zh 分支模式（字符串或正则）与发布类型的映射关系。
 *
 * @returns
 * @en The matched release type, or null if no pattern matches
 * @zh 匹配到的发布类型，如果没有匹配项则返回 null。
 *
 * @example
 * // If branches is { "main": "latest", "feat/*": "preminor" }
 * resolveBranchPolicy("main", branches) // returns "latest"
 * resolveBranchPolicy("feat/ui-button", branches) // returns "preminor"
 */
export function resolveBranchPolicy(
  branch: string,
  branches?: Record<string, BranchType>,
): BranchType | null {
  if (!branches) return null
  for (const [pattern, type] of Object.entries(branches))
    if (normalizeRegExp(pattern).test(branch)) return type
  return null
}

/**
 * @en Retrieves the git commit history for a specific package directory.
 * @zh 获取特定包目录的 Git 提交历史记录。
 *
 * @param cwd
 * @en Current working directory
 * @zh 当前工作目录
 *
 * @param relPath
 * @en Relative path of the package (e.g., 'packages/pkg-a')
 * @zh 包的相对路径（如 'packages/pkg-a'）
 *
 * @param since
 * @en Optional commit hash or tag to start the range from
 * @zh 可选的起始提交哈希或标签
 *
 * @returns
 * @en A list of commit objects containing hash and message
 * @zh 包含哈希和消息的提交对象列表
 */
export async function getPackageCommits(
  cwd: string,
  relPath: string,
  since?: string,
) {
  const args = ['log', '--first-parent', '--pretty=format:%H|%B\x1e']

  if (since) args.push(`${since}..HEAD`)

  args.push('--', relPath)

  try {
    const { stdout } = await runSafe('git', args, { cwd })
    if (!stdout || !stdout.trim()) return []

    const mainLineCommits = stdout.split('\x1e').filter(Boolean)
    const allRelevantCommits: { message: string; hash: string }[] = []

    for (const line of mainLineCommits) {
      const { hash, message: subject } = parseGitLogRecord(line)

      const { stdout: parents } = await runSafe(
        'git',
        ['show', '-s', '--format=%P', hash],
        { cwd },
      )
      const parentHashes = parents.trim().split(/\s+/)

      if (parentHashes.length > 1) {
        const { stdout: sideCommitsRaw } = await runSafe(
          'git',
          [
            'log',
            `${parentHashes[0]}..${parentHashes[1]}`,
            '--pretty=format:%H|%B\x1e',
            '--',
            relPath,
          ],
          { cwd },
        )

        const sideCommits = sideCommitsRaw
          .split('\x1e')
          .filter(Boolean)
          .map(parseGitLogRecord)

        const lastReleaseIndex = sideCommits.findIndex(c =>
          /^release(\(.*\))?:/i.test(c.message),
        )

        if (lastReleaseIndex !== -1) {
          const validSideCommits = sideCommits.slice(0, lastReleaseIndex)
          allRelevantCommits.push(...validSideCommits)
        } else {
          allRelevantCommits.push(...sideCommits)
        }
      }

      allRelevantCommits.push({ hash, message: subject })
    }

    return allRelevantCommits
  } catch {
    return []
  }
}

/**
 * @en Contributor profile metadata used in changelog rendering.
 * @zh 用于 Changelog 渲染的贡献者资料元数据。
 */
interface Contributor {
  /** @en Contributor display name. @zh 贡献者显示名。 */
  name: string
  /** @en Contributor email (normalized lowercase). @zh 贡献者邮箱（小写规范化）。 */
  email: string
  /** @en Contributor avatar URL. @zh 贡献者头像地址。 */
  avatar: string
  /** @en Contributor profile URL. @zh 贡献者主页地址。 */
  url: string
  /** @en First contribution PR info if available. @zh 若可用则记录首次贡献 PR 信息。 */
  firstPR?: { num: string; url: string }
}

/**
 * @en Collect contributor info and first contribution metadata since a commit.
 * @zh 收集自指定提交以来的贡献者信息与首次贡献元数据。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @param sinceHash
 * @en Optional starting commit hash.
 * @zh 可选的起始提交哈希。
 *
 * @param repoUrl
 * @en Optional repository URL for generating profile/PR links.
 * @zh 可选仓库地址，用于生成用户与 PR 链接。
 *
 * @param pkgPath
 * @en Optional package path filter for workspace mode.
 * @zh 可选的包路径过滤（工作区模式使用）。
 *
 * @returns
 * @en Contributor lists grouped by all and newly-added contributors.
 * @zh 按全部与新增贡献者分组的贡献者列表。
 */
export async function getContributors(
  cwd: string,
  sinceHash?: string,
  repoUrl?: string,
  pkgPath?: string,
) {
  const currentContributors: Contributor[] = []
  const allContributorsMap = new Map<string, Contributor>()
  const historyEmailSet = new Set<string>()

  const authorFirstPr = new Map<string, { pr: string; hash: string }>()

  const pathFilter = pkgPath ? ['--', pkgPath] : []

  if (sinceHash) {
    try {
      const { stdout: historyStdout } = await execa(
        'git',
        ['log', sinceHash, '--pretty=format:%ae', ...pathFilter],
        { cwd },
      )
      historyStdout.split('\n').forEach(e => {
        const clean = e.trim().toLowerCase()
        if (clean) historyEmailSet.add(clean)
      })
    } catch (error) {
      if (process.env.NXSPUB_DEBUG) {
        cliLogger.dim(
          `Failed to load contributor history emails: ${String(error)}`,
        )
      }
    }
  }

  const range = sinceHash ? `${sinceHash}..HEAD` : 'HEAD'
  repoUrl = repoUrl || (await getRepoUrl(cwd))
  const links = createLinkProvider(repoUrl)
  let repoHost = ''
  try {
    repoHost = new URL(repoUrl).hostname.toLowerCase()
  } catch {
    repoHost = ''
  }
  const isGitHub = repoHost === 'github.com' || repoHost.endsWith('.github.com')
  const isGitLab = repoHost === 'gitlab.com' || repoHost.endsWith('.gitlab.com')

  try {
    const { stdout } = await execa(
      'git',
      ['log', range, '--pretty=format:%H|%an|%ae|%s', ...pathFilter],
      { cwd },
    )
    const lines = stdout.split('\n').filter(Boolean)

    let lastFoundPR = ''

    for (const line of lines) {
      const record = splitContributorRecord(line)
      if (!record) continue
      const { hash, name, email, subject } = record
      if (!email) continue

      const cleanEmail = email.trim().toLowerCase()

      const squashMatch = subject.match(/\(#(\d+)\)$/)

      const mergeMatch = subject.match(/#(\d+)/)

      if (squashMatch) {
        authorFirstPr.set(cleanEmail, { pr: squashMatch[0], hash })
      } else if (mergeMatch) {
        lastFoundPR = mergeMatch[0]
      } else if (lastFoundPR && !authorFirstPr.has(cleanEmail)) {
        authorFirstPr.set(cleanEmail, { pr: lastFoundPR, hash })
      }

      if (cleanEmail.includes('bot') || allContributorsMap.has(cleanEmail))
        continue

      const md5 = createHash('md5').update(cleanEmail).digest('hex')
      const initialsFallback = encodeURIComponent(
        `https://www.gravatar.com/avatar/${md5}?d=identicon`,
      )

      let avatar = ''
      if (isGitHub) {
        avatar = `https://unavatar.io/github/${cleanEmail}?fallback=${initialsFallback}`
      } else if (isGitLab) {
        avatar = `https://unavatar.io/gitlab/${cleanEmail}?fallback=${initialsFallback}`
      } else {
        avatar = `https://unavatar.io/gravatar/${cleanEmail}?fallback=${initialsFallback}`
      }

      const contributor = {
        name,
        email: cleanEmail,
        avatar,
        url: links.user(name),
      }

      allContributorsMap.set(cleanEmail, contributor)
      currentContributors.push(contributor)
    }

    const newContributors = currentContributors.filter(
      c => !historyEmailSet.has(c.email),
    )

    return {
      all: currentContributors.map(c => ({ ...c })),
      new: newContributors.map(c => {
        const firstPR = authorFirstPr.get(c.email)
        if (firstPR) {
          let prNumber = firstPR.pr.replace('#', '')
          let prLink = links.pr(prNumber)
          return {
            ...c,
            firstPR: { num: prNumber, url: prLink },
          }
        }
        return c
      }),
    }
  } catch {
    return { all: [], new: [] }
  }
}

/**
 * @en Ensures the local environment is safe for a release.
 * @zh 确保本地环境处于安全的可发布状态（工作区干净且与远程同步）。
 */
export async function ensureGitSync(currentBranch: string, cwd: string) {
  cliLogger.step('Pre-flight Safety Check')

  const { stdout: isDirty } = await runSafe('git', ['status', '--porcelain'], {
    cwd,
  })
  if (isDirty.trim()) {
    cliLogger.error('Admission Denied: Working directory is not clean.')
    cliLogger.item('Please commit or stash your changes before releasing.')
    abort(1)
  }

  try {
    cliLogger.item(`Fetching origin/${currentBranch}...`)
    await run('git', ['fetch', 'origin', currentBranch], { cwd })

    const { stdout: status } = await runSafe(
      'git',
      [
        'rev-list',
        '--left-right',
        '--count',
        `${currentBranch}...origin/${currentBranch}`,
      ],
      { cwd },
    )

    // 格式通常为 "0\t5"，这里我们只需要关注 "Behind" (远程比本地领先的数量)
    const [ahead, behind] = status.trim().split('\t').map(Number)

    if (behind > 0) {
      cliLogger.warn(`Local branch is behind remote by ${behind} commit(s).`)
      cliLogger.item('Attempting fast-forward pull...')

      try {
        await run('git', ['pull', '--ff-only', 'origin', currentBranch], {
          cwd,
        })
        cliLogger.success('Successfully synchronized with remote.')
      } catch {
        cliLogger.error('Conflict Detected: Automatic pull failed.')
        cliLogger.item(
          'Please resolve merge conflicts manually before running nxspub.',
        )
        abort(1)
      }
    } else if (ahead > 0) {
      cliLogger.error(`Local branch is ahead of remote by ${ahead} commit(s).`)
      cliLogger.item(
        'Admission Denied: Please push your local commits before releasing.',
      )
      cliLogger.item(
        'This ensures all changes are tracked and verified by remote CI.',
      )
      abort(1)
    } else {
      cliLogger.item('Local branch is perfectly aligned with remote.')
    }
  } catch (e) {
    cliLogger.error(JSON.stringify(e))
    abort(1)
  }
}

/**
 * @en Get a mapping of commit hashes to their corresponding tag names.
 * @zh 获取提交哈希到标签名称的映射表。
 */
export async function getTagHashMap(cwd: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const { stdout } = await runSafe('git', ['show-ref', '--tags'], { cwd })
    stdout.split('\n').forEach(line => {
      const [hash, ref] = line.split(' ')
      if (ref) map.set(hash, ref.replace('refs/tags/', ''))
    })
  } catch (error) {
    if (process.env.NXSPUB_DEBUG) {
      cliLogger.dim(`Failed to load git tag hash map: ${String(error)}`)
    }
  }
  return map
}

/**
 * @en Get the commit history segmented by release versions,
 * with optional filtering for a specific package path.
 * @zh 获取按版本切分后的历史段（支持 Workspace 路径过滤）。
 */
export async function getSegmentedHistory(cwd: string, relPath?: string) {
  const args = ['log', '--first-parent', '--pretty=format:%H|%s']
  if (relPath) args.push('--', relPath)

  const { stdout } = await runSafe('git', args, { cwd })
  const commits = stdout.split('\n').filter(Boolean).map(parseGitLogRecord)

  const tagMap = await getTagHashMap(cwd)
  const segments: {
    version: string
    commits: { hash: string; message: string }[]
  }[] = []
  let currentGroup: { hash: string; message: string }[] = []

  const versionRegex = /(?:release|publish|version):?\s*v?(\d+\.\d+\.\d+)/i

  for (const commit of commits) {
    const tagName = tagMap.get(commit.hash)
    const msgMatch = commit.message.match(versionRegex)

    if ((tagName || msgMatch) && currentGroup.length > 0) {
      const title = tagName || (msgMatch ? `v${msgMatch[1]}` : 'Unknown')
      segments.push({ version: title, commits: [...currentGroup] })
      currentGroup = []
    }
    currentGroup.push(commit)
  }

  if (currentGroup.length > 0) {
    segments.push({ version: 'Initial Release', commits: currentGroup })
  }

  return segments
}

/**
 * @en Generates standardized links for commits, pull requests, and issues across different platforms.
 * @zh 为不同平台（GitHub, GitLab, Gitee, Bitbucket）生成统一的提交、PR 和 Issue 链接。
 */
export function createLinkProvider(repoUrl: string) {
  const base = repoUrl.replace(/\/$/, '')

  const { hostname, siteBase } = (() => {
    try {
      const url = new URL(base)
      return {
        hostname: url.hostname.toLowerCase(),
        siteBase: `${url.protocol}//${url.host}`,
      }
    } catch {
      return {
        hostname: '',
        siteBase: '',
      }
    }
  })()

  const isHost = (host: string, domain: string) =>
    host === domain || host.endsWith(`.${domain}`)

  const isGitLab = isHost(hostname, 'gitlab.com')
  const isBitbucket = isHost(hostname, 'bitbucket.org')
  const isGitee = isHost(hostname, 'gitee.com')

  return {
    user: (username: string) => {
      const cleanName = username.replace(/^@/, '')
      return siteBase ? `${siteBase}/${cleanName}` : `${base}/${cleanName}`
    },

    compare: (from: string = '', to: string) => {
      if (!from) {
        if (isGitLab) return `${base}/-/tags/${to}`
        if (isBitbucket) return `${base}/src/${to}`
        return `${base}/tree/${to}`
      }

      if (isBitbucket) {
        return `${base}/branches/compare/${from}%0D${to}#diff`
      }

      const connector = isGitLab ? '..' : '...'

      return `${base}/compare/${from}${connector}${to}`
    },

    commit: (hash: string) => {
      const segment = isBitbucket ? 'commits' : 'commit'
      return `${base}/${segment}/${hash}`
    },

    pr: (id: string) => {
      if (isGitLab) return `${base}/merge_requests/${id}`
      if (isBitbucket) return `${base}/pull-requests/${id}`
      if (isGitee) return `${base}/pull/${id}`

      return `${base}/pull/${id}`
    },

    issue: (id: string) => {
      return `${base}/issues/${id}`
    },
  }
}
