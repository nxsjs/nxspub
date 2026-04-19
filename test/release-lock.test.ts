import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { withReleaseLock } from '../src/utils/release-lock'

describe('release lock', () => {
  it('blocks a second process when lock is active', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-lock-'))

    let releaseFirstTask: (() => void) | undefined
    const firstTask = withReleaseLock(tempDir, async () => {
      await new Promise<void>(resolve => {
        releaseFirstTask = resolve
      })
      return 'first-done'
    })

    await new Promise(resolve => setTimeout(resolve, 20))

    await expect(
      withReleaseLock(tempDir, async () => 'second-done'),
    ).rejects.toThrow(/lock/)

    releaseFirstTask?.()
    await expect(firstTask).resolves.toBe('first-done')
  })

  it('removes stale lock and continues', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-lock-'))
    const lockPath = path.join(tempDir, '.nxspub', 'version.lock')
    await mkdir(path.dirname(lockPath), { recursive: true })

    await writeFile(
      lockPath,
      JSON.stringify({
        pid: 1234,
        createdAt: '2000-01-01T00:00:00.000Z',
      }),
      'utf-8',
    )

    await expect(withReleaseLock(tempDir, async () => 'ok')).resolves.toBe('ok')
    const lockExistsAfterRun = await readFile(lockPath, 'utf-8').catch(() => '')
    expect(lockExistsAfterRun).toBe('')
  })
})
