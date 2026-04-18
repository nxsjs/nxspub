import { execa } from 'execa'
import { createHash } from 'node:crypto'
import type { BrancheType } from '../config'
import { nxsLog } from './logger'
import { normalizeRegExp } from './regexp'

/**
 * @en Execute a command and inherit stdio (suitable for interactive commands).
 * @zh 执行命令并继承标准输入输出（适用于交互式命令）。
 */
export const run = (bin: string, args: string[], opts = {}) =>
  execa(bin, args, { stdio: 'inherit', ...opts })

/**
 * @en Execute a command and capture output (suitable for background logic).
 * @zh 执行命令并捕获输出（适用于后台逻辑计算）。
 */
export const runSafe = (bin: string, args: string[], opts = {}) =>
  execa(bin, args, { ...opts })

/**
 * @en Get the remote origin repository URL and normalize it for private/IP-based GitLab.
 * @zh 获取远程仓库地址并规范化，适配包含 IP、端口及不同协议的私有 GitLab。
 */
export async function getRepoUrl() {
  try {
    const { stdout } = await execa('git', ['remote', 'get-url', 'origin'])
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
export async function getRawCommits(from?: string) {
  const args = ['log', '--first-parent', '--pretty=format:%H|%B\x1e']

  if (from) args.push(`${from}..HEAD`)

  try {
    const { stdout } = await execa('git', args)
    const mainLineCommits = stdout.split('\x1e').filter(Boolean)

    let allMessages: { message: string; hash: string }[] = []

    for (const line of mainLineCommits) {
      const [part1 = '', part2 = ''] = line.split('|')
      const hash = part1.trim()
      const subject = part2.trim()
      const { stdout: parents } = await execa('git', [
        'show',
        '--summary',
        '--format=%P',
        '-s',
        hash,
      ])
      const parentHashes = parents.trim().split(/\s+/)

      if (parentHashes.length > 1) {
        const { stdout: sideCommitsRaw } = await execa('git', [
          'log',
          `${parentHashes[0]}..${parentHashes[1]}`,
          '--pretty=format:%H|%B\x1e',
        ])

        const sideCommits = sideCommitsRaw
          .split('\x1e')
          .filter(Boolean)
          .map(s => {
            const [part1 = '', part2 = ''] = s.split('|')
            const hash = part1.trim()
            const subject = part2.trim()
            return { hash, message: subject }
          })

        const lastReleaseIndex = sideCommits.findIndex(c =>
          /^release(\(.*\))?:/i.test(c.message),
        )

        if (lastReleaseIndex !== -1) {
          const validSideCommits = sideCommits.slice(0, lastReleaseIndex)
          allMessages.push(...validSideCommits)
        } else {
          allMessages.push(...sideCommits)
        }

        allMessages.push({ message: subject, hash })
      } else {
        allMessages.push({ message: subject, hash })
      }
    }

    return allMessages
  } catch (e) {
    nxsLog.error(JSON.stringify(e))
    return []
  }
}

/**
 * @en Find the most recent release commit on the current branch's mainline.
 * @zh 在当前分支的主干线上查找最近一次发布的提交记录。
 */
export async function getLastReleaseCommit() {
  try {
    const { stdout } = await execa('git', [
      'log',
      '--first-parent',
      '--grep=^release\(.*\)\?:',
      '-n',
      '1',
      '--pretty=format:%H|%B',
      '--extended-regexp',
    ])
    if (!stdout) return null

    const firstPipeIndex = stdout.indexOf('|')
    const hash = stdout.slice(0, firstPipeIndex)
    const msg = stdout.slice(firstPipeIndex + 1)

    const mainVersionMatch = msg.match(/v(\d+\.\d+\.\d+)/)
    const version = mainVersionMatch ? mainVersionMatch[1] : 'unknown'

    const workspacePackages: {
      name: string
      version: string
      private: boolean
    }[] = []

    const packageLineRegex =
      /^- (@?[^\s@/]+(?:\/[^\s@/]+)?)@([\d.]+[\w.-]*)(?:\s*(\(private\)))?/gm

    let match
    while ((match = packageLineRegex.exec(msg)) !== null) {
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
export async function getCurrentBranch(): Promise<string | undefined> {
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
    const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
    const result = stdout.trim()
    if (result && result !== 'HEAD') return result
  } catch {}

  return undefined
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
 * getBranchContract("main", branches) // returns "latest"
 * getBranchContract("feat/ui-button", branches) // returns "preminor"
 */
export function getBranchContract(
  branch: string,
  branches?: Record<string, BrancheType>,
): BrancheType | null {
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
      const [part1 = '', part2 = ''] = line.split('|')
      const hash = part1.trim()
      const subject = part2.trim()

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
          .map(s => {
            const [part1 = '', part2 = ''] = s.split('|')
            const hash = part1.trim()
            const subject = part2.trim()
            return { hash, message: subject }
          })

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

interface Contributor {
  name: string
  email: string
  avatar: string
  url: string
  firstPR?: { num: string; url: string }
}

export async function getContributors(
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
      const { stdout: historyStdout } = await execa('git', [
        'log',
        sinceHash,
        '--pretty=format:%ae',
        ...pathFilter,
      ])
      historyStdout.split('\n').forEach(e => {
        const clean = e.trim().toLowerCase()
        if (clean) historyEmailSet.add(clean)
      })
    } catch {}
  }

  const range = sinceHash ? `${sinceHash}..HEAD` : 'HEAD'
  repoUrl = repoUrl || (await getRepoUrl())
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
    const { stdout } = await execa('git', [
      'log',
      range,
      '--pretty=format:%H|%an|%ae|%s',
      ...pathFilter,
    ])
    const lines = stdout.split('\n').filter(Boolean)

    let lastFoundPR = ''

    for (const line of lines) {
      const [hash, name, email, subject] = line.split('|')
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
  nxsLog.step('Pre-flight Safety Check')

  const { stdout: isDirty } = await runSafe('git', ['status', '--porcelain'], {
    cwd,
  })
  if (isDirty.trim()) {
    nxsLog.error('Admission Denied: Working directory is not clean.')
    nxsLog.item('Please commit or stash your changes before releasing.')
    process.exit(1)
  }

  try {
    nxsLog.item(`Fetching origin/${currentBranch}...`)
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
      nxsLog.warn(`Local branch is behind remote by ${behind} commit(s).`)
      nxsLog.item('Attempting fast-forward pull...')

      try {
        await run('git', ['pull', '--ff-only', 'origin', currentBranch], {
          cwd,
        })
        nxsLog.success('Successfully synchronized with remote.')
      } catch {
        nxsLog.error('Conflict Detected: Automatic pull failed.')
        nxsLog.item(
          'Please resolve merge conflicts manually before running nxspub.',
        )
        process.exit(1)
      }
    } else if (ahead > 0) {
      nxsLog.error(`Local branch is ahead of remote by ${ahead} commit(s).`)
      nxsLog.item(
        'Admission Denied: Please push your local commits before releasing.',
      )
      nxsLog.item(
        'This ensures all changes are tracked and verified by remote CI.',
      )
      process.exit(1)
    } else {
      nxsLog.item('Local branch is perfectly aligned with remote.')
    }
  } catch (e) {
    nxsLog.error(JSON.stringify(e))
    process.exit(1)
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
  } catch {}
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
  const commits = stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, ...msg] = line.split('|')
      return { hash, message: msg.join('|') }
    })

  const tagMap = await getTagHashMap(cwd)
  const segments: {
    version: string
    commits: { hash: string; message: string }[]
  }[] = []
  let currentGroup: any[] = []

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

  const hostname = (() => {
    try {
      return new URL(base).hostname.toLowerCase()
    } catch {
      return ''
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
      return `${base}/${cleanName}`
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
