import fs from 'node:fs/promises'
import path from 'node:path'
import type { DeployRecord } from './types'

interface DeployRecordIndexItem {
  deploymentId: string
  env: string
  strategy: string
  branch: string
  status: string
  finishedAt: string
  rollbackTo?: string
}

interface DeployRecordIndexFile {
  items: DeployRecordIndexItem[]
}

const INDEX_FILE = 'index.json'
const INDEX_LOCK_FILE = 'index.lock'
const INDEX_LOCK_WAIT_MS = 25
const INDEX_LOCK_MAX_RETRY = 120

/**
 * @en Resolve deploy records directory under workspace.
 * @zh 解析工作区下 deploy records 目录。
 */
export function getDeployRecordDir(cwd: string): string {
  return path.join(cwd, '.nxspub', 'deploy-records')
}

async function atomicWriteFile(filePath: string, content: string) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmpPath, content, 'utf-8')
  await fs.rename(tmpPath, filePath)
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function withIndexWriteLock<T>(
  recordDir: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockPath = path.join(recordDir, INDEX_LOCK_FILE)
  let attempts = 0
  let lockHandle: Awaited<ReturnType<typeof fs.open>> | null = null

  while (!lockHandle) {
    try {
      lockHandle = await fs.open(lockPath, 'wx')
    } catch {
      attempts += 1
      if (attempts > INDEX_LOCK_MAX_RETRY) {
        throw new Error(
          `Timed out acquiring deploy index lock after ${INDEX_LOCK_MAX_RETRY} retries.`,
        )
      }
      await sleep(INDEX_LOCK_WAIT_MS)
    }
  }

  try {
    return await task()
  } finally {
    await lockHandle.close().catch(() => {})
    await fs.unlink(lockPath).catch(() => {})
  }
}

/**
 * @en Save one deploy record and refresh summary index.
 * @zh 保存单条部署记录并刷新摘要索引。
 */
export async function saveDeployRecord(
  cwd: string,
  record: DeployRecord,
): Promise<void> {
  const recordDir = getDeployRecordDir(cwd)
  await fs.mkdir(recordDir, { recursive: true })
  await withIndexWriteLock(recordDir, async () => {
    const detailPath = path.join(recordDir, `${record.deploymentId}.json`)
    await atomicWriteFile(detailPath, JSON.stringify(record, null, 2) + '\n')

    const indexPath = path.join(recordDir, INDEX_FILE)
    let currentIndex: DeployRecordIndexFile = { items: [] }
    try {
      const content = await fs.readFile(indexPath, 'utf-8')
      const parsed = JSON.parse(content) as DeployRecordIndexFile
      if (Array.isArray(parsed.items)) {
        currentIndex = parsed
      }
    } catch {
      currentIndex = { items: [] }
    }

    const nextItem: DeployRecordIndexItem = {
      deploymentId: record.deploymentId,
      env: record.env,
      strategy: record.strategy,
      branch: record.branch,
      status: record.status,
      finishedAt: record.finishedAt,
      rollbackTo: record.rollbackTo,
    }
    const filtered = currentIndex.items.filter(
      item => item.deploymentId !== record.deploymentId,
    )
    filtered.unshift(nextItem)
    const nextIndex: DeployRecordIndexFile = {
      items: filtered.slice(0, 500),
    }
    await atomicWriteFile(indexPath, JSON.stringify(nextIndex, null, 2) + '\n')
  })
}

/**
 * @en Read deploy summary index.
 * @zh 读取部署摘要索引。
 */
export async function readDeployRecordIndex(
  cwd: string,
): Promise<DeployRecordIndexFile> {
  const indexPath = path.join(getDeployRecordDir(cwd), INDEX_FILE)
  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content) as DeployRecordIndexFile
    if (!Array.isArray(parsed.items)) return { items: [] }
    return parsed
  } catch {
    return { items: [] }
  }
}

/**
 * @en Read one deploy record by deployment id.
 * @zh 按 deployment id 读取单条部署记录。
 */
export async function readDeployRecord(
  cwd: string,
  deploymentId: string,
): Promise<DeployRecord | null> {
  const detailPath = path.join(
    getDeployRecordDir(cwd),
    `${deploymentId.trim()}.json`,
  )
  try {
    const content = await fs.readFile(detailPath, 'utf-8')
    return JSON.parse(content) as DeployRecord
  } catch {
    return null
  }
}
