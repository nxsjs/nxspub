import fs from 'node:fs/promises'
import path from 'node:path'
import { cliLogger } from './logger'

const LOCK_MAX_AGE_MS = 30 * 60 * 1000

/**
 * @en Execute a task under repository-scoped release lock.
 * @zh 在仓库级发布锁保护下执行任务。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @param task
 * @en Async task that must be serialized.
 * @zh 需要串行执行的异步任务。
 *
 * @returns
 * @en Task result.
 * @zh 任务执行结果。
 */
export async function withReleaseLock<T>(
  cwd: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockDir = await resolveLockDir(cwd)
  const lockFilePath = path.join(lockDir, 'version.lock')
  const lockPayload = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
  }
  await fs.mkdir(path.dirname(lockFilePath), { recursive: true })

  const tryAcquireLock = async () => {
    const lockFile = await fs.open(lockFilePath, 'wx')
    await lockFile.writeFile(
      JSON.stringify(lockPayload, null, 2) + '\n',
      'utf-8',
    )
    await lockFile.close()
  }

  try {
    await tryAcquireLock()
  } catch {
    const staleRemoved = await clearStaleLock(lockFilePath)
    if (staleRemoved) {
      await tryAcquireLock()
    } else {
      throw new Error(
        `Another release/version process is running (lock: ${lockFilePath}).`,
      )
    }
  }

  try {
    return await task()
  } finally {
    await fs.unlink(lockFilePath).catch(() => {})
  }
}

/**
 * @en Resolve lock directory for current working tree.
 * @zh 解析当前工作树对应的锁目录。
 *
 * @param cwd
 * @en Any directory inside repository.
 * @zh 仓库内任意目录。
 *
 * @returns
 * @en Absolute lock directory path.
 * @zh 锁目录绝对路径。
 */
async function resolveLockDir(cwd: string): Promise<string> {
  const start = path.resolve(cwd)
  let current = start

  while (true) {
    const gitMetaDir = await resolveGitPath(path.join(current, '.git'), current)
    if (gitMetaDir) return path.join(gitMetaDir, 'nxspub')

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return path.join(start, '.nxspub')
}

async function resolveGitPath(
  gitPath: string,
  parentDir: string,
): Promise<string | null> {
  try {
    const stat = await fs.stat(gitPath)
    if (stat.isDirectory()) return gitPath
    if (!stat.isFile()) return null

    const raw = await fs.readFile(gitPath, 'utf-8')
    const match = raw.match(/^gitdir:\s*(.+)\s*$/im)
    if (!match) return null
    const target = match[1].trim()
    return path.isAbsolute(target) ? target : path.resolve(parentDir, target)
  } catch {
    return null
  }
}

/**
 * @en Remove lock file when it is older than TTL.
 * @zh 当锁文件超过 TTL 时自动清理。
 *
 * @param lockFilePath
 * @en Absolute lock file path.
 * @zh 锁文件绝对路径。
 *
 * @returns
 * @en True when stale lock was removed.
 * @zh 清理了过期锁时返回 true。
 */
async function clearStaleLock(lockFilePath: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(lockFilePath, 'utf-8')
    const parsed = JSON.parse(raw) as { createdAt?: string; pid?: number }
    const createdAtMs = parsed.createdAt ? Date.parse(parsed.createdAt) : NaN
    if (Number.isNaN(createdAtMs)) return false
    if (Date.now() - createdAtMs <= LOCK_MAX_AGE_MS) return false
    if (typeof parsed.pid === 'number' && isProcessAlive(parsed.pid))
      return false

    await fs.unlink(lockFilePath)
    cliLogger.dim(`Removed stale release lock: ${lockFilePath}`)
    return true
  } catch {
    return false
  }
}

/**
 * @en Check whether a process id is still alive on current machine.
 * @zh 检查指定进程号在当前机器上是否仍存活。
 *
 * @param pid
 * @en Process id from lock metadata.
 * @zh 来自锁元数据的进程号。
 *
 * @returns
 * @en True when process appears alive.
 * @zh 进程存活时返回 true。
 */
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ESRCH') return false
    return true
  }
}
