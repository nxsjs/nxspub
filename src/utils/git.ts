import { execa } from 'execa'

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
 * @en Get the remote origin repository URL and normalize it to HTTPS format.
 * @zh 获取远程仓库地址并将其规范化为 HTTPS 格式。
 */
export async function getRepoUrl() {
  try {
    const { stdout } = await execa('git', ['remote', 'get-url', 'origin'])
    let url = stdout.trim()

    if (url.startsWith('git@')) {
      url = 'https://' + url.replace(/^git@/, '').replace(/:(?=[^/])/, '/')
    }

    url = url.replace(/\.git$/, '')

    if (url.startsWith('https://') && url.includes('@')) {
      url = 'https://' + url.split('@')[1]
    }

    return url
  } catch {
    return 'https://github.com/nxsjs/nxspub'
  }
}

/**
 * @en Generate comparison URL based on host type.
 * @zh 根据托管平台类型生成对比链接。
 */
export function getCompareUrl(repoUrl: string, from: string = '', to: string) {
  const isGitLab = repoUrl.includes('gitlab')
  const connector = isGitLab ? '..' : '...'
  return from
    ? `${repoUrl}/compare/v${from}${connector}v${to}`
    : `${repoUrl}/compare/v${to}`
}

/**
 * @en Get incremental commit records with "Side-chain Penetration".
 * This logic identifies Merge Commits and extracts commits from the merged branch
 * to ensure no semantic information (feat/fix) is lost.
 * @zh 获取增量提交记录（具备“侧链穿透”能力）。
 * 该逻辑能识别合并节点并提取侧链上的提交，确保不会丢失合并分支内部的语义信息。
 */
export async function getRawCommits(from?: string) {
  const args = ['log', '--first-parent', '--pretty=format:%H|%s']
  if (from) args.push(`${from}..HEAD`)

  try {
    const { stdout } = await execa('git', args)
    const mainLineCommits = stdout.split('\n').filter(Boolean)

    let allMessages: { message: string; hash: string }[] = []

    for (const line of mainLineCommits) {
      const [hash, subject] = line.split('|')

      const { stdout: parents } = await execa('git', [
        'show',
        '--summary',
        '--format=%P',
        '-s',
        hash,
      ])
      const parentHashes = parents.trim().split(/\s+/)

      if (parentHashes.length > 1) {
        const { stdout: sideCommits } = await execa('git', [
          'log',
          `${parentHashes[0]}..${parentHashes[1]}`,
          '--pretty=format:%s|%h',
        ])

        sideCommits
          .split('\n')
          .filter(Boolean)
          .forEach(s => {
            const [m, h] = s.split('|')
            allMessages.push({ message: m, hash: h })
          })

        allMessages.push({ message: subject, hash })
      } else {
        allMessages.push({ message: subject, hash })
      }
    }

    return allMessages
  } catch {
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
      '--grep=^release: v',
      '-n',
      '1',
      '--pretty=format:%H|%s',
    ])

    if (!stdout) return null

    const [hash, msg] = stdout.split('|')
    const version = msg.replace('release: v', '').trim()

    return { hash, version }
  } catch {
    return null
  }
}

/**
 * @en Get the current branch name.
 * @zh 获取当前分支名称。
 */
export async function getCurrentBranch(
  cwd: string,
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
  } catch {}

  return undefined
}
