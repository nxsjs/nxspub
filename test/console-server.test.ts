import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('preview web server APIs', () => {
  it('returns 401 for api calls without session token', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
    })

    try {
      const response = await fetch(`${handle.url}/api/health`)
      expect(response.status).toBe(401)
    } finally {
      await handle.close()
    }
  })

  it('returns 403 for prune endpoint in readonly-strict mode', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn(),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
      readonlyStrict: true,
    })

    try {
      const response = await fetch(`${handle.url}/api/drafts/prune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify({ target: '1.2.3', only: 'behind' }),
      })
      expect(response.status).toBe(403)
    } finally {
      await handle.close()
    }
  })

  it('returns 403 for snapshot write endpoints in readonly-strict mode', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main', 'alpha'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const tempCwd = await mkdtemp(path.join(os.tmpdir(), 'nxspub-snapshot-'))
    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: tempCwd,
      host: '127.0.0.1',
      port: 0,
      readonlyStrict: true,
    })

    const snapshotPayload = {
      id: 'blocked-write',
      baseBranch: 'main',
      compareBranch: 'alpha',
      basePreview: {
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 1,
        releasePackageCount: 1,
      },
      comparePreview: {
        mode: 'single',
        branch: 'alpha',
        policy: { branch: 'alpha', policy: 'preminor', ok: true },
        commitCount: 2,
        releasePackageCount: 1,
      },
    }

    try {
      const saveResponse = await fetch(`${handle.url}/api/snapshots`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify(snapshotPayload),
      })
      expect(saveResponse.status).toBe(403)

      const deleteResponse = await fetch(
        `${handle.url}/api/snapshots/blocked-write`,
        {
          method: 'DELETE',
          headers: {
            'x-nxspub-console-token': handle.token,
          },
        },
      )
      expect(deleteResponse.status).toBe(403)
    } finally {
      await handle.close()
    }
  })

  it('returns 409 when preview request is already in-flight', async () => {
    let resolveFirstPreview: (() => void) | undefined
    let previewCallCount = 0

    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockImplementation(async () => {
        previewCallCount += 1
        if (previewCallCount === 1) {
          await new Promise<void>(resolve => {
            resolveFirstPreview = resolve
          })
        }
        return {
          mode: 'single',
          branch: 'main',
          policy: { branch: 'main', policy: 'latest', ok: true },
          commitCount: 0,
          releasePackageCount: 0,
        }
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
    })

    try {
      const firstRequest = fetch(`${handle.url}/api/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify({ includeChangelog: false }),
      })

      await new Promise(resolve => setTimeout(resolve, 20))

      const secondResponse = await fetch(`${handle.url}/api/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify({ includeChangelog: false }),
      })

      expect(secondResponse.status).toBe(409)

      resolveFirstPreview?.()
      const firstResponse = await firstRequest
      expect(firstResponse.status).toBe(200)
    } finally {
      await handle.close()
    }
  })

  it('executes prune endpoint in writable mode', async () => {
    const pruneDrafts = vi.fn().mockResolvedValue({
      prunedCount: 2,
      remaining: 3,
      affectedFiles: ['/repo/.nxspub/changelog-drafts/alpha/1.2.0.json'],
    })

    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts,
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
      readonlyStrict: false,
    })

    try {
      const response = await fetch(`${handle.url}/api/drafts/prune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify({ target: '1.2.3', only: 'behind' }),
      })
      expect(response.status).toBe(200)
      const payload = (await response.json()) as {
        data: { prunedCount: number }
      }
      expect(payload.data.prunedCount).toBe(2)
      expect(pruneDrafts).toHaveBeenCalledWith(process.cwd(), {
        target: '1.2.3',
        only: 'behind',
      })
    } finally {
      await handle.close()
    }
  })

  it('passes dryRun flag to prune endpoint payload', async () => {
    const pruneDrafts = vi.fn().mockResolvedValue({
      prunedCount: 0,
      remaining: 5,
      affectedFiles: ['/repo/.nxspub/changelog-drafts/alpha/1.2.0.json'],
    })

    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts,
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
      readonlyStrict: false,
    })

    try {
      const response = await fetch(`${handle.url}/api/drafts/prune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify({ target: '1.2.3', only: 'behind', dryRun: true }),
      })
      expect(response.status).toBe(200)
      expect(pruneDrafts).toHaveBeenCalledWith(process.cwd(), {
        target: '1.2.3',
        only: 'behind',
        dryRun: true,
      })
    } finally {
      await handle.close()
    }
  })

  it('returns 404 for root page when running in api-only mode', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
      apiOnly: true,
    })

    try {
      const response = await fetch(`${handle.url}/`)
      expect(response.status).toBe(404)
    } finally {
      await handle.close()
    }
  })

  it('returns 400 for prune endpoint when target is not x.y.z', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn(),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
      readonlyStrict: false,
    })

    try {
      const response = await fetch(`${handle.url}/api/drafts/prune`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify({ target: '1.2.3-alpha.1', only: 'behind' }),
      })
      expect(response.status).toBe(400)
    } finally {
      await handle.close()
    }
  })

  it('returns 408 TIMEOUT when preview computation exceeds timeout budget', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockImplementation(
        async () =>
          await new Promise(resolve => {
            setTimeout(
              () =>
                resolve({
                  mode: 'single',
                  branch: 'main',
                  policy: { branch: 'main', policy: 'latest', ok: true },
                  commitCount: 0,
                  releasePackageCount: 0,
                }),
              40,
            )
          }),
      ),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
      requestTimeoutMs: 10,
    })

    try {
      const response = await fetch(`${handle.url}/api/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify({ includeChangelog: false }),
      })
      expect(response.status).toBe(408)
      const payload = (await response.json()) as { error: { code: string } }
      expect(payload.error.code).toBe('TIMEOUT')
    } finally {
      await handle.close()
    }
  })

  it('exports diagnostic bundle in json format', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
    })

    try {
      const response = await fetch(
        `${handle.url}/api/export.bundle?format=json`,
        {
          headers: {
            'x-nxspub-console-token': handle.token,
          },
        },
      )
      expect(response.status).toBe(200)
      const payload = (await response.json()) as {
        data: {
          meta: { apiVersion: string }
          context: { mode: string }
          preview: { branch: string }
          checks: { items: unknown[] }
          drafts: { target: string }
        }
      }
      expect(payload.data.meta.apiVersion).toBe('v1')
      expect(payload.data.context.mode).toBe('single')
      expect(payload.data.preview.branch).toBe('main')
      expect(Array.isArray(payload.data.checks.items)).toBe(true)
      expect(payload.data.drafts.target).toBe('1.0.0')
    } finally {
      await handle.close()
    }
  })

  it('exports diagnostic bundle in zip format', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
    })

    try {
      const response = await fetch(
        `${handle.url}/api/export.bundle?format=zip`,
        {
          headers: {
            'x-nxspub-console-token': handle.token,
          },
        },
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/zip')
      const buffer = await response.arrayBuffer()
      expect(buffer.byteLength).toBeGreaterThan(0)
    } finally {
      await handle.close()
    }
  })

  it('saves, lists, and loads preview snapshots', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 1,
        releasePackageCount: 1,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main', 'alpha'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const tempCwd = await mkdtemp(path.join(os.tmpdir(), 'nxspub-snapshot-'))
    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: tempCwd,
      host: '127.0.0.1',
      port: 0,
    })

    const snapshotPayload = {
      id: 'main-vs-alpha',
      baseBranch: 'main',
      compareBranch: 'alpha',
      basePreview: {
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 1,
        releasePackageCount: 1,
      },
      comparePreview: {
        mode: 'single',
        branch: 'alpha',
        policy: { branch: 'alpha', policy: 'preminor', ok: true },
        commitCount: 2,
        releasePackageCount: 1,
      },
    }

    try {
      const saveResponse = await fetch(`${handle.url}/api/snapshots`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify(snapshotPayload),
      })
      expect(saveResponse.status).toBe(200)

      const listResponse = await fetch(`${handle.url}/api/snapshots`, {
        headers: {
          'x-nxspub-console-token': handle.token,
        },
      })
      expect(listResponse.status).toBe(200)
      const listPayload = (await listResponse.json()) as {
        data: { snapshots: Array<{ id: string }> }
      }
      expect(
        listPayload.data.snapshots.some(s => s.id === 'main-vs-alpha'),
      ).toBe(true)

      const loadResponse = await fetch(
        `${handle.url}/api/snapshots/main-vs-alpha`,
        {
          headers: {
            'x-nxspub-console-token': handle.token,
          },
        },
      )
      expect(loadResponse.status).toBe(200)
      const loadPayload = (await loadResponse.json()) as {
        data: { baseBranch: string; compareBranch: string }
      }
      expect(loadPayload.data.baseBranch).toBe('main')
      expect(loadPayload.data.compareBranch).toBe('alpha')
    } finally {
      await handle.close()
    }
  })

  it('returns 404 when snapshot id does not exist', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const tempCwd = await mkdtemp(path.join(os.tmpdir(), 'nxspub-snapshot-'))
    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: tempCwd,
      host: '127.0.0.1',
      port: 0,
    })

    try {
      const response = await fetch(
        `${handle.url}/api/snapshots/does-not-exist`,
        {
          headers: {
            'x-nxspub-console-token': handle.token,
          },
        },
      )
      expect(response.status).toBe(404)
    } finally {
      await handle.close()
    }
  })

  it('deletes snapshot and returns 404 after deletion', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 1,
        releasePackageCount: 1,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main', 'alpha'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const tempCwd = await mkdtemp(path.join(os.tmpdir(), 'nxspub-snapshot-'))
    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: tempCwd,
      host: '127.0.0.1',
      port: 0,
    })

    const snapshotPayload = {
      id: 'to-be-deleted',
      baseBranch: 'main',
      compareBranch: 'alpha',
      basePreview: {
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 1,
        releasePackageCount: 1,
      },
      comparePreview: {
        mode: 'single',
        branch: 'alpha',
        policy: { branch: 'alpha', policy: 'preminor', ok: true },
        commitCount: 2,
        releasePackageCount: 1,
      },
    }

    try {
      const saveResponse = await fetch(`${handle.url}/api/snapshots`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-nxspub-console-token': handle.token,
        },
        body: JSON.stringify(snapshotPayload),
      })
      expect(saveResponse.status).toBe(200)

      const deleteResponse = await fetch(
        `${handle.url}/api/snapshots/to-be-deleted`,
        {
          method: 'DELETE',
          headers: {
            'x-nxspub-console-token': handle.token,
          },
        },
      )
      expect(deleteResponse.status).toBe(200)

      const deletePayload = (await deleteResponse.json()) as {
        data: { id: string; deleted: boolean }
      }
      expect(deletePayload.data.id).toBe('to-be-deleted')
      expect(deletePayload.data.deleted).toBe(true)

      const loadResponse = await fetch(
        `${handle.url}/api/snapshots/to-be-deleted`,
        {
          headers: {
            'x-nxspub-console-token': handle.token,
          },
        },
      )
      expect(loadResponse.status).toBe(404)
    } finally {
      await handle.close()
    }
  })

  it('returns 401 for SSE endpoint without token', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
    })

    try {
      const response = await fetch(`${handle.url}/api/events`)
      expect(response.status).toBe(401)
    } finally {
      await handle.close()
    }
  })

  it('opens SSE endpoint with token query', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const handle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
    })

    try {
      const response = await fetch(
        `${handle.url}/api/events?token=${encodeURIComponent(handle.token)}`,
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      )
      await response.body?.cancel()
    } finally {
      await handle.close()
    }
  })

  it('auto-selects next available port when requested port is occupied', async () => {
    vi.doMock('../src/console/core', () => ({
      buildPreviewChecksReport: vi.fn().mockResolvedValue({
        policy: { ok: true },
        gitSync: { ok: true, ahead: 0, behind: 0, dirty: false },
        tagConflicts: [],
        registryConflicts: [],
        items: [],
      }),
      buildPreviewResult: vi.fn().mockResolvedValue({
        mode: 'single',
        branch: 'main',
        policy: { branch: 'main', policy: 'latest', ok: true },
        commitCount: 0,
        releasePackageCount: 0,
      }),
      getDraftHealthSummary: vi.fn().mockResolvedValue({
        target: '1.0.0',
        matching: 0,
        behind: 0,
        ahead: 0,
        invalid: 0,
        malformedFileCount: 0,
        behindSamples: [],
      }),
      getPreviewContext: vi.fn().mockResolvedValue({
        cwd: '/repo',
        mode: 'single',
        packageManager: 'pnpm',
        currentBranch: 'main',
        availableBranches: ['main'],
      }),
      pruneDrafts: vi.fn().mockResolvedValue({
        prunedCount: 0,
        remaining: 0,
        affectedFiles: [],
      }),
    }))

    const { startConsoleWebServer } = await import('../src/console/server')
    const firstHandle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: 0,
    })
    const firstPort = Number(new URL(firstHandle.url).port)
    expect(firstPort).toBeGreaterThan(0)

    const secondHandle = await startConsoleWebServer({
      cwd: process.cwd(),
      host: '127.0.0.1',
      port: firstPort,
    })

    try {
      const secondPort = Number(new URL(secondHandle.url).port)
      expect(secondPort).toBeGreaterThan(0)
      expect(secondPort).not.toBe(firstPort)
    } finally {
      await secondHandle.close()
      await firstHandle.close()
    }
  })
})
