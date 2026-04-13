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
      `Release Denied: Version "${pkg.version}" is not a prerelease version.`,
    )
    process.exit(1)
  }

  nxsLog.step(`Checking registry...`)
  nxsLog.item(`Package Name: ${nxsLog.highlight(pkg.name)}`)
  nxsLog.item(`Package Version: ${nxsLog.highlight(pkg.version)}`)
  const isExists = await checkVersionExists(pkg.name, pkg.version, registry)

  if (isExists) {
    nxsLog.warn(`Skip: ${pkg.name}@${pkg.version} is already published.`)
    return
  }

  nxsLog.step('Running build...')
  if (!dry) {
    if (config.scripts?.releaseBuild) {
      nxsLog.item(`Run: ${nxsLog.highlight(config.scripts.releaseBuild)}`)
      await run(config.scripts.releaseBuild, [], { cwd, shell: true })
    } else if (pkg.scripts?.build) {
      nxsLog.item(`Run: ${nxsLog.highlight(pkg.scripts?.build)}`)
      await run('pnpm', ['run', 'build'], { cwd })
    }
  } else {
    nxsLog.item(
      `Run: ${nxsLog.highlight(config.scripts?.releaseBuild || pkg.scripts?.build)}`,
    )
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

  nxsLog.step(`Publishing v${pkg.version} to ${registry || 'NPM'}...`)
  nxsLog.item(
    `Tag: ${nxsLog.highlight(releaseTag || 'latest')} | Access: ${access}`,
  )

  try {
    await run('pnpm', publishArgs, { cwd })

    if (!dry) {
      nxsLog.success(
        `Successfully released v${pkg.version} to @${releaseTag || 'latest'}`,
      )
    } else {
      nxsLog.warn('Dry run completed successfully.')
    }
  } catch {
    nxsLog.error('NPM Publish command failed.')
    process.exit(1)
  }
}
