import { loadConfig } from '../utils/load-config'
import { withDeployLock } from '../utils/deploy-lock'
import { cliLogger } from '../utils/logger'
import { buildDeployPlan, runDeploy, runDeployRollback } from '../deploy/core'
import type { DeployOptions } from './types'

/**
 * @en Run deploy command with plan/execute/rollback modes.
 * @zh 运行 deploy 命令（计划/执行/回滚模式）。
 */
export async function deployCommand(options: DeployOptions) {
  const config = await loadConfig(options.cwd)

  if (options.plan) {
    const plan = await buildDeployPlan(options, config)
    if (options.json) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
      return
    }
    cliLogger.step('Deploy Plan')
    cliLogger.item(`env: ${plan.env}`)
    cliLogger.item(`strategy: ${plan.strategy}`)
    cliLogger.item(`mode: ${plan.mode}`)
    cliLogger.item(`branch: ${plan.branch}`)
    cliLogger.item(`artifacts: ${plan.artifacts.length}`)
    for (const check of plan.checks) {
      const mark = check.ok ? '[OK]' : '[BLOCK]'
      cliLogger.item(`${mark} ${check.id}: ${check.message}`)
    }
    return
  }

  const runTask = async () => {
    if (options.rollback) {
      const rollbackResult = await runDeployRollback(options, config)
      if (options.json) {
        process.stdout.write(`${JSON.stringify(rollbackResult, null, 2)}\n`)
        return
      }
      cliLogger.step('Deploy Rollback')
      cliLogger.item(`deploymentId: ${rollbackResult.deploymentId}`)
      cliLogger.item(`rollbackTo: ${rollbackResult.rollbackTo}`)
      cliLogger.item(`status: ${rollbackResult.status}`)
      return
    }

    const deployResult = await runDeploy(options, config)
    if (options.json) {
      process.stdout.write(`${JSON.stringify(deployResult, null, 2)}\n`)
      return
    }
    cliLogger.step('Deploy Result')
    cliLogger.item(`deploymentId: ${deployResult.deploymentId}`)
    cliLogger.item(`status: ${deployResult.status}`)
    cliLogger.item(`deployed: ${deployResult.deployed.length}`)
    cliLogger.item(`skipped: ${deployResult.skipped.length}`)
    cliLogger.item(`failed: ${deployResult.failed.length}`)
  }

  await withDeployLock(options.cwd, runTask)
}
