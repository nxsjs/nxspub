import path from 'node:path'
import * as semver from 'semver-es'
import type { NxspubConfig } from '../config'
import type { ReleaseOptions } from './types'
import { abort } from '../utils/errors'
import {
  ensureGitSync,
  resolveBranchPolicy,
  getCurrentBranch,
  run,
} from '../utils/git'
import { cliLogger } from '../utils/logger'
import { checkVersionExists } from '../utils/npm'
import { detectPackageManager } from '../utils/package-manager'
import { readJSON } from '../utils/packages'

/**
 * @en Publish a single package to registry with branch policy and safety checks.
 * @zh 在分支策略与安全检查通过后发布单个包到注册表。
 *
 * @param options
 * @en Release command options.
 * @zh 发布命令参数。
 *
 * @param config
 * @en Resolved nxspub configuration.
 * @zh 已解析的 nxspub 配置。
 *
 * @returns
 * @en Resolves when publish flow is completed.
 * @zh 发布流程完成后返回。
 */
export async function releaseSingle(
  options: ReleaseOptions,
  config: NxspubConfig,
) {
  const {
    cwd,
    dry,
    provenance,
    registry,
    access = 'public',
    tag,
    branch,
    skipBuild,
    skipSync,
  } = options
  const pkgPath = path.resolve(cwd, 'package.json')

  const packageJson = await readJSON(pkgPath)
  const packageManager = await detectPackageManager(cwd)
  const currentBranch = branch || (await getCurrentBranch(cwd))
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

  if (currentBranch && !dry && !skipBuild && !skipSync) {
    await ensureGitSync(currentBranch, cwd)
  }

  const isPrereleasePolicy = branchReleasePolicy.startsWith('pre')
  const preTags = semver.prerelease(packageJson.version) || []
  if (isPrereleasePolicy && preTags.length < 2) {
    cliLogger.error(
      `Release Denied: Version "${packageJson.version}" is not a valid prerelease for policy "${branchReleasePolicy}".`,
    )
    abort(1)
  }
  if (!isPrereleasePolicy && preTags.length > 0) {
    cliLogger.error(
      `Release Denied: Branch policy "${branchReleasePolicy}" does not allow prerelease version "${packageJson.version}".`,
    )
    abort(1)
  }

  cliLogger.step(`Checking registry...`)
  cliLogger.item(`Package: ${packageJson.name}`)
  cliLogger.item(`Version: ${packageJson.version}`)
  const versionAlreadyPublished = await checkVersionExists(
    packageJson.name,
    packageJson.version,
    registry,
  )
  if (versionAlreadyPublished) {
    cliLogger.warn(
      `Skip: ${packageJson.name}@${packageJson.version} is already published.`,
    )
    return
  }

  if (!skipBuild) {
    cliLogger.step('Running build process...')
    if (config.scripts?.releaseBuild) {
      cliLogger.item(`Run: ${cliLogger.highlight(config.scripts.releaseBuild)}`)
    } else {
      cliLogger.item(`Build Script: ${packageManager.name} run build`)
    }
    if (!dry) {
      if (config.scripts?.releaseBuild) {
        cliLogger.item(
          `Run: ${cliLogger.highlight(config.scripts.releaseBuild)}`,
        )
        await run(config.scripts.releaseBuild, [], { cwd, shell: true })
      } else if (packageJson.scripts?.build) {
        const command = packageManager.runScript('build')
        cliLogger.item(`Run: ${command.bin} ${command.args.join(' ')}`)
        await run(command.bin, command.args, { cwd })
      }
    }
  } else {
    cliLogger.dim(`Build skipped (triggered by workspace pipeline)`)
  }

  const releaseTag =
    tag || (typeof preTags[0] === 'string' ? preTags[0] : undefined)

  const publishArgs = [
    '--no-git-checks',
    '--access',
    access,
    ...(releaseTag ? ['--tag', releaseTag] : []),
    ...(registry ? ['--registry', registry] : []),
    ...(provenance ? ['--provenance'] : []),
    ...(dry ? ['--dry-run'] : []),
  ]

  cliLogger.step(`Publishing...`)
  cliLogger.item(
    `Package: ${packageJson.name}@${packageJson.version} Registry: ${registry || 'Default'} | Tag: ${releaseTag || 'latest'}\n`,
  )

  try {
    const command = packageManager.publish(publishArgs)
    await run(command.bin, command.args, { cwd })
    if (!dry) {
      cliLogger.success(`Released ${packageJson.name}@${packageJson.version}`)
    }
  } catch {
    cliLogger.error(`NPM Publish failed for ${packageJson.name}`)
    abort(1)
  }
}
