import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('deploy core promotion checks', () => {
  it('blocks production deploy when source artifact version differs', async () => {
    const execute = vi.fn().mockResolvedValue({
      deploymentId: 'new-deploy',
      status: 'success',
      deployed: [{ name: 'demo', version: '1.3.0' }],
      skipped: [],
      failed: [],
      timeline: [],
    })
    const saveDeployRecord = vi.fn()

    vi.doMock('../src/utils/git', () => ({
      getCurrentBranch: vi.fn().mockResolvedValue('main'),
      runSafe: vi.fn().mockResolvedValue({ stdout: 'abc123\n' }),
    }))
    vi.doMock('../src/utils/packages', () => ({
      readJSON: vi.fn().mockResolvedValue({ name: 'demo', version: '1.3.0' }),
      scanWorkspacePackages: vi.fn(),
    }))
    vi.doMock('../src/deploy/providers', () => ({
      createDeployProviderAdapter: vi.fn().mockReturnValue({
        validate: vi.fn().mockResolvedValue(undefined),
        plan: vi.fn(),
        execute,
        rollback: vi.fn(),
      }),
    }))
    vi.doMock('../src/deploy/records', () => ({
      readDeployRecordIndex: vi.fn().mockResolvedValue({
        items: [
          {
            deploymentId: 'staging-ok',
            env: 'staging',
            status: 'success',
            strategy: 'rolling',
            branch: 'main',
            finishedAt: '2026-04-20T00:00:00.000Z',
          },
        ],
      }),
      readDeployRecord: vi.fn().mockResolvedValue({
        deploymentId: 'staging-ok',
        env: 'staging',
        strategy: 'rolling',
        branch: 'main',
        status: 'success',
        startedAt: '2026-04-20T00:00:00.000Z',
        finishedAt: '2026-04-20T00:10:00.000Z',
        artifacts: [{ name: 'demo', version: '1.2.9', source: 'registry' }],
        timeline: [],
        result: {
          deploymentId: 'staging-ok',
          status: 'success',
          deployed: [{ name: 'demo', version: '1.2.9' }],
          skipped: [],
          failed: [],
          timeline: [],
        },
      }),
      saveDeployRecord,
    }))

    const { runDeploy } = await import('../src/deploy/core')

    await expect(
      runDeploy(
        {
          cwd: '/repo',
          env: 'production',
          dry: true,
        },
        {
          deploy: {
            defaultEnvironment: 'production',
            provider: { name: 'custom', config: {} },
            environments: { staging: {}, production: {} },
          },
        },
      ),
    ).rejects.toThrow(/Promotion blocked/)

    expect(execute).not.toHaveBeenCalled()
    expect(saveDeployRecord).not.toHaveBeenCalled()
  })

  it('allows production deploy when source artifact versions match', async () => {
    const execute = vi.fn().mockResolvedValue({
      deploymentId: 'new-deploy',
      status: 'success',
      deployed: [{ name: 'demo', version: '1.3.0' }],
      skipped: [],
      failed: [],
      timeline: [],
    })
    const saveDeployRecord = vi.fn()

    vi.doMock('../src/utils/git', () => ({
      getCurrentBranch: vi.fn().mockResolvedValue('main'),
      runSafe: vi.fn().mockResolvedValue({ stdout: 'abc123\n' }),
    }))
    vi.doMock('../src/utils/packages', () => ({
      readJSON: vi.fn().mockResolvedValue({ name: 'demo', version: '1.3.0' }),
      scanWorkspacePackages: vi.fn(),
    }))
    vi.doMock('../src/deploy/providers', () => ({
      createDeployProviderAdapter: vi.fn().mockReturnValue({
        validate: vi.fn().mockResolvedValue(undefined),
        plan: vi.fn(),
        execute,
        rollback: vi.fn(),
      }),
    }))
    vi.doMock('../src/deploy/records', () => ({
      readDeployRecordIndex: vi.fn().mockResolvedValue({
        items: [
          {
            deploymentId: 'staging-ok',
            env: 'staging',
            status: 'success',
            strategy: 'rolling',
            branch: 'main',
            finishedAt: '2026-04-20T00:00:00.000Z',
          },
        ],
      }),
      readDeployRecord: vi.fn().mockResolvedValue({
        deploymentId: 'staging-ok',
        env: 'staging',
        strategy: 'rolling',
        branch: 'main',
        status: 'success',
        startedAt: '2026-04-20T00:00:00.000Z',
        finishedAt: '2026-04-20T00:10:00.000Z',
        artifacts: [{ name: 'demo', version: '1.3.0', source: 'registry' }],
        timeline: [],
        result: {
          deploymentId: 'staging-ok',
          status: 'success',
          deployed: [{ name: 'demo', version: '1.3.0' }],
          skipped: [],
          failed: [],
          timeline: [],
        },
      }),
      saveDeployRecord,
    }))

    const { runDeploy } = await import('../src/deploy/core')
    await runDeploy(
      {
        cwd: '/repo',
        env: 'production',
        dry: true,
      },
      {
        deploy: {
          defaultEnvironment: 'production',
          provider: { name: 'custom', config: {} },
          environments: { staging: {}, production: {} },
        },
      },
    )

    expect(execute).toHaveBeenCalledTimes(1)
    expect(saveDeployRecord).toHaveBeenCalledTimes(1)
  })
})
