import path from 'node:path'
import * as semver from 'semver-es'
import type { NxspubConfig } from '../config'
import type { ReleaseOptions } from './types'
import { abort } from '../utils/errors'
import {
  ensureGitSync,
  resolveBranchType,
  getCurrentBranch,
  run,
} from '../utils/git'
import { cliLogger } from '../utils/logger'
import { checkVersionExists } from '../utils/npm'
import { detectPackageManager } from '../utils/package-manager'
import { readJSON } from '../utils/packages'

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

  const pkg = await readJSON(pkgPath)
  const packageManager = await detectPackageManager(cwd)
  const currentBranch = branch || (await getCurrentBranch(cwd))
  const branchReleaseType = resolveBranchType(currentBranch!, config.branches)

  if (!branchReleaseType) {
    cliLogger.error(
      `Admission Denied: Branch "${currentBranch}" not configured.`,
    )
    abort(1)
  }

  if (currentBranch && !dry && !skipBuild && !skipSync) {
    await ensureGitSync(currentBranch, cwd)
  }

  const isPreContract = branchReleaseType.startsWith('pre')
  const preTags = semver.prerelease(pkg.version) || []
  if (isPreContract && preTags.length < 2) {
    cliLogger.error(
      `Release Denied: Version "${pkg.version}" is not a valid prerelease for contract "${branchReleaseType}".`,
    )
    abort(1)
  }

  cliLogger.step(`Checking registry...`)
  cliLogger.item(`Package: ${pkg.name}`)
  cliLogger.item(`Version: ${pkg.version}`)
  const versionAlreadyPublished = await checkVersionExists(
    pkg.name,
    pkg.version,
    registry,
  )
  if (versionAlreadyPublished) {
    cliLogger.warn(`Skip: ${pkg.name}@${pkg.version} is already published.`)
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
      } else if (pkg.scripts?.build) {
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
    `Package: ${pkg.name}@${pkg.version} Registry: ${registry || 'Default'} | Tag: ${releaseTag || 'latest'}\n`,
  )

  try {
    const command = packageManager.publish(publishArgs)
    await run(command.bin, command.args, { cwd })
    if (!dry) {
      cliLogger.success(`Released ${pkg.name}@${pkg.version}`)
    }
  } catch {
    cliLogger.error(`NPM Publish failed for ${pkg.name}`)
    abort(1)
  }
}
