import path from 'node:path'
import * as semver from 'semver-es'
import type { NxspubConfig } from '../config'
import type { ReleaseOptions } from './types'
import { abort } from '../utils/errors'
import {
  ensureGitSync,
  getCurrentBranch,
  resolveBranchPolicy,
  run,
} from '../utils/git'
import { cliLogger } from '../utils/logger'
import { detectPackageManager } from '../utils/package-manager'
import {
  type PackageInfo,
  readJSON,
  scanWorkspacePackages,
  topologicalSort,
} from '../utils/packages'
import type { ReleaseExecutionSummary } from './release'
import { releaseSingle } from './release-single'

/**
 * @en Release all publishable packages in a workspace following dependency order.
 * @zh 按依赖顺序发布工作区内所有可发布包。
 *
 * @param options
 * @en Release command options for workspace mode.
 * @zh 工作区发布命令参数。
 *
 * @param config
 * @en Resolved nxspub configuration.
 * @zh 已解析的 nxspub 配置。
 *
 * @returns
 * @en Resolves when workspace release completes.
 * @zh 工作区发布完成后返回。
 */
export async function releaseWorkspace(
  options: ReleaseOptions,
  config: NxspubConfig,
): Promise<ReleaseExecutionSummary> {
  const { cwd, dry, branch, skipSync } = options

  const currentBranch = branch || (await getCurrentBranch(cwd))
  const packageManager = await detectPackageManager(cwd)

  if (currentBranch && !dry && !skipSync) {
    await ensureGitSync(currentBranch, cwd)
  }

  const branchReleasePolicy = resolveBranchPolicy(
    currentBranch!,
    config.branches,
  )
  if (!branchReleasePolicy) {
    cliLogger.error(
      `Admission Denied: Branch "${currentBranch}" not configured.`,
    )
    abort(1)
  }

  cliLogger.step('Workspace Release: Initializing Pipeline')

  const workspacePackages = await scanWorkspacePackages(cwd)
  const tasks = new Map<string, PackageInfo>()
  workspacePackages.forEach(info => tasks.set(info.name, info))

  const sortedNames = topologicalSort(tasks)
  const publicPackages = sortedNames
    .map(name => tasks.get(name))
    .filter(
      (packageInfo): packageInfo is PackageInfo =>
        !!packageInfo && !packageInfo.private,
    )

  if (publicPackages.length === 0) {
    cliLogger.success('No public packages found in workspace.')
    return { published: [], skipped: [] }
  }

  const isPrereleasePolicy = branchReleasePolicy.startsWith('pre')
  const eligiblePackages: PackageInfo[] = []
  const skippedPackages: PackageInfo[] = []

  for (const pkg of publicPackages) {
    const preTags = semver.prerelease(pkg.version) || []
    const isPrereleaseVersion = preTags.length > 0
    const canReleaseOnBranch = isPrereleasePolicy
      ? isPrereleaseVersion
      : !isPrereleaseVersion

    if (canReleaseOnBranch) {
      eligiblePackages.push(pkg)
    } else {
      skippedPackages.push(pkg)
    }
  }

  cliLogger.item(
    `Release Queue (${publicPackages.length}): ${publicPackages.map(p => p.name).join(', ')}`,
  )
  if (skippedPackages.length > 0) {
    cliLogger.warn(
      `Skipped ${skippedPackages.length} package(s) due to branch policy "${branchReleasePolicy}": ${skippedPackages.map(p => `${p.name}@${p.version}`).join(', ')}`,
    )
  }
  if (eligiblePackages.length === 0) {
    cliLogger.success(
      `No packages match branch policy "${branchReleasePolicy}" for release.`,
    )
    return {
      published: [],
      skipped: skippedPackages.map(pkg => ({
        name: pkg.name,
        version: pkg.version,
        reason: 'branch_policy_mismatch',
      })),
    }
  }

  cliLogger.step('Building all workspace packages...')
  if (config.scripts?.releaseBuild) {
    cliLogger.item(`Build Script: ${config.scripts.releaseBuild}`)
  } else {
    cliLogger.item(`Build Script: ${packageManager.name} run build`)
  }
  if (!dry) {
    if (config.scripts?.releaseBuild) {
      await run(config.scripts.releaseBuild, [], { cwd, shell: true })
    } else {
      const rootPackageJson = await readJSON(path.join(cwd, 'package.json'))
      if (rootPackageJson.scripts?.build) {
        const command = packageManager.runScript('build')
        await run(command.bin, command.args, { cwd })
      }
    }
  }

  const summary: ReleaseExecutionSummary = {
    published: [],
    skipped: skippedPackages.map(pkg => ({
      name: pkg.name,
      version: pkg.version,
      reason: 'branch_policy_mismatch',
    })),
  }

  for (const packageInfo of eligiblePackages) {
    const singleResult = await releaseSingle(
      {
        ...options,
        cwd: packageInfo.dir,
        skipBuild: true,
        resolvedPackageManager: packageManager,
      },
      config,
    )
    summary.published.push(...(singleResult?.published || []))
    summary.skipped.push(...(singleResult?.skipped || []))
  }

  cliLogger.success('Workspace release completed successfully.')
  return summary
}
