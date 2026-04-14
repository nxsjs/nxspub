import path from 'node:path'
import * as semver from 'semver-es'
import type { NxspubConfig } from '../config'
import { getBranchContract, getCurrentBranch, run } from '../utils/git'
import { nxsLog } from '../utils/logger'
import { checkVersionExists } from '../utils/npm'
import { readJSON } from '../utils/packages'

export async function releaseSingle(
  options: {
    cwd: string
    dry?: boolean
    provenance?: boolean
    registry?: string
    access?: string
    tag?: string
    branch?: string
    skipBuild?: boolean
  },
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
  } = options
  const pkgPath = path.resolve(cwd, 'package.json')

  const pkg = await readJSON(pkgPath)
  const currentBranch = branch || (await getCurrentBranch())
  const branchContract = getBranchContract(currentBranch!, config.branches)

  if (!branchContract) {
    nxsLog.error(`Admission Denied: Branch "${currentBranch}" not configured.`)
    process.exit(1)
  }

  const isPreContract = branchContract.startsWith('pre')
  const preTags = semver.prerelease(pkg.version) || []
  if (isPreContract && preTags.length < 2) {
    nxsLog.error(
      `Release Denied: Version "${pkg.version}" is not a valid prerelease for contract "${branchContract}".`,
    )
    process.exit(1)
  }

  nxsLog.step(`Checking registry: ${pkg.name}`)
  const isExists = await checkVersionExists(pkg.name, pkg.version, registry)

  if (isExists) {
    nxsLog.warn(`Skip: ${pkg.name}@${pkg.version} is already published.`)
    return
  }

  if (!skipBuild) {
    nxsLog.step('Running build process...')
    if (!dry) {
      if (config.scripts?.releaseBuild) {
        nxsLog.item(`Run: ${nxsLog.highlight(config.scripts.releaseBuild)}`)
        await run(config.scripts.releaseBuild, [], { cwd, shell: true })
      } else if (pkg.scripts?.build) {
        nxsLog.item(`Run: pnpm run build`)
        await run('pnpm', ['run', 'build'], { cwd })
      }
    }
  } else {
    nxsLog.dim(`Build skipped (triggered by workspace pipeline)`)
  }

  const releaseTag =
    tag || (typeof preTags[0] === 'string' ? preTags[0] : undefined)

  const publishArgs = [
    'publish',
    '--no-git-checks',
    '--access',
    access,
    ...(releaseTag ? ['--tag', releaseTag] : []),
    ...(registry ? ['--registry', registry] : []),
    ...(provenance ? ['--provenance'] : []),
    ...(dry ? ['--dry-run'] : []),
  ]

  nxsLog.step(`Publishing ${nxsLog.highlight(pkg.name)}@${pkg.version}`)
  nxsLog.item(
    `Registry: ${registry || 'Default'} | Tag: ${releaseTag || 'latest'}`,
  )

  try {
    await run('pnpm', publishArgs, { cwd })
    if (!dry) {
      nxsLog.success(`Released ${pkg.name}@${pkg.version}`)
    }
  } catch {
    nxsLog.error(`NPM Publish failed for ${pkg.name}`)
    process.exit(1)
  }
}
