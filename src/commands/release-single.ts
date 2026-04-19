import path from 'node:path'
import * as semver from 'semver-es'
import type { NxspubConfig } from '../config'
import type { ReleaseOptions } from './types'
import { abort } from '../utils/errors'
import {
  ensureGitSync,
  getBranchContract,
  getCurrentBranch,
  run,
} from '../utils/git'
import { nxsLog } from '../utils/logger'
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
  const branchContract = getBranchContract(currentBranch!, config.branches)

  if (!branchContract) {
    nxsLog.error(`Admission Denied: Branch "${currentBranch}" not configured.`)
    abort(1)
  }

  if (currentBranch && !dry && !skipBuild && !skipSync) {
    await ensureGitSync(currentBranch, cwd)
  }

  const isPreContract = branchContract.startsWith('pre')
  const preTags = semver.prerelease(pkg.version) || []
  if (isPreContract && preTags.length < 2) {
    nxsLog.error(
      `Release Denied: Version "${pkg.version}" is not a valid prerelease for contract "${branchContract}".`,
    )
    abort(1)
  }

  nxsLog.step(`Checking registry...`)
  nxsLog.item(`Package: ${pkg.name}`)
  nxsLog.item(`Version: ${pkg.version}`)
  const isExists = await checkVersionExists(pkg.name, pkg.version, registry)
  if (isExists) {
    nxsLog.warn(`Skip: ${pkg.name}@${pkg.version} is already published.`)
    return
  }

  if (!skipBuild) {
    nxsLog.step('Running build process...')
    if (config.scripts?.releaseBuild) {
      nxsLog.item(`Run: ${nxsLog.highlight(config.scripts.releaseBuild)}`)
    } else {
      nxsLog.item(`Build Script: ${packageManager.name} run build`)
    }
    if (!dry) {
      if (config.scripts?.releaseBuild) {
        nxsLog.item(`Run: ${nxsLog.highlight(config.scripts.releaseBuild)}`)
        await run(config.scripts.releaseBuild, [], { cwd, shell: true })
      } else if (pkg.scripts?.build) {
        const command = packageManager.runScript('build')
        nxsLog.item(`Run: ${command.bin} ${command.args.join(' ')}`)
        await run(command.bin, command.args, { cwd })
      }
    }
  } else {
    nxsLog.dim(`Build skipped (triggered by workspace pipeline)`)
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

  nxsLog.step(`Publishing...`)
  nxsLog.item(
    `Package: ${pkg.name}@${pkg.version} Registry: ${registry || 'Default'} | Tag: ${releaseTag || 'latest'}\n`,
  )

  try {
    const command = packageManager.publish(publishArgs)
    await run(command.bin, command.args, { cwd })
    if (!dry) {
      nxsLog.success(`Released ${pkg.name}@${pkg.version}`)
    }
  } catch {
    nxsLog.error(`NPM Publish failed for ${pkg.name}`)
    abort(1)
  }
}
