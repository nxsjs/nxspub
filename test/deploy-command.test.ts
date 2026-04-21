import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('deploy command', () => {
  it('runs plan mode without acquiring release lock', async () => {
    const loadConfig = vi.fn().mockResolvedValue({})
    const buildDeployPlan = vi.fn().mockResolvedValue({
      env: 'staging',
      strategy: 'rolling',
      mode: 'single',
      branch: 'main',
      artifacts: [{ name: 'demo', version: '1.0.0', source: 'registry' }],
      checks: [],
    })
    const lockSpy = vi.fn()

    vi.doMock('../src/utils/load-config', () => ({ loadConfig }))
    vi.doMock('../src/deploy/core', () => ({
      buildDeployPlan,
      runDeploy: vi.fn(),
      runDeployRollback: vi.fn(),
    }))
    vi.doMock('../src/utils/deploy-lock', () => ({
      withDeployLock: lockSpy,
    }))

    const { deployCommand } = await import('../src/commands/deploy')
    await deployCommand({
      cwd: '/repo',
      plan: true,
      json: true,
    })

    expect(buildDeployPlan).toHaveBeenCalledTimes(1)
    expect(lockSpy).not.toHaveBeenCalled()
  })

  it('runs rollback mode under lock', async () => {
    const loadConfig = vi.fn().mockResolvedValue({})
    const runDeployRollback = vi.fn().mockResolvedValue({
      deploymentId: 'abc',
      rollbackTo: 'prev',
      status: 'success',
      timeline: [],
    })
    const withDeployLock = vi
      .fn()
      .mockImplementation(async (_cwd: string, task: () => Promise<void>) => {
        await task()
      })

    vi.doMock('../src/utils/load-config', () => ({ loadConfig }))
    vi.doMock('../src/deploy/core', () => ({
      buildDeployPlan: vi.fn(),
      runDeploy: vi.fn(),
      runDeployRollback,
    }))
    vi.doMock('../src/utils/deploy-lock', () => ({
      withDeployLock,
    }))

    const { deployCommand } = await import('../src/commands/deploy')
    await deployCommand({
      cwd: '/repo',
      rollback: true,
      to: 'prev',
      json: true,
    })

    expect(withDeployLock).toHaveBeenCalledTimes(1)
    expect(runDeployRollback).toHaveBeenCalledTimes(1)
  })
})
