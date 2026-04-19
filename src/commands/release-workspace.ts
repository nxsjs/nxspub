import path from 'node:path'
import type { NxspubConfig } from '../config'
import type { ReleaseOptions } from './types'
import { ensureGitSync, getCurrentBranch, run } from '../utils/git'
import { nxsLog } from '../utils/logger'
import { detectPackageManager } from '../utils/package-manager'
import {
  type PackageInfo,
  readJSON,
  scanWorkspacePackages,
  topologicalSort,
} from '../utils/packages'
import { releaseSingle } from './release-single'

export async function releaseWorkspace(
  options: ReleaseOptions,
  config: NxspubConfig,
) {
  const { cwd, dry, branch, skipSync } = options

  const currentBranch = branch || (await getCurrentBranch(cwd))
  const packageManager = await detectPackageManager(cwd)

  if (currentBranch && !dry && !skipSync) {
    await ensureGitSync(currentBranch, cwd)
  }

  nxsLog.step('Workspace Release: Initializing Pipeline')

  const allInfos = await scanWorkspacePackages(cwd)
  const tasks = new Map<string, PackageInfo>()
  allInfos.forEach(info => tasks.set(info.name, info))

  const sortedNames = topologicalSort(tasks)
  const publicPackages = sortedNames
    .map(name => tasks.get(name))
    .filter((pkg): pkg is PackageInfo => !!pkg && !pkg.private)

  if (publicPackages.length === 0) {
    nxsLog.success('No public packages found in workspace.')
    return
  }

  nxsLog.item(
    `Release Queue (${publicPackages.length}): ${publicPackages.map(p => p.name).join(', ')}`,
  )

  nxsLog.step('Building all workspace packages...')
  if (config.scripts?.releaseBuild) {
    nxsLog.item(`Build Script: ${config.scripts.releaseBuild}`)
  } else {
    nxsLog.item(`Build Script: ${packageManager.name} run build`)
  }
  if (!dry) {
    if (config.scripts?.releaseBuild) {
      await run(config.scripts.releaseBuild, [], { cwd, shell: true })
    } else {
      const rootPkg = await readJSON(path.join(cwd, 'package.json'))
      if (rootPkg.scripts?.build) {
        const command = packageManager.runScript('build')
        await run(command.bin, command.args, { cwd })
      }
    }
  }

  for (const pkg of publicPackages) {
    await releaseSingle(
      {
        ...options,
        cwd: pkg.dir,
        skipBuild: true,
      },
      config,
    )
  }

  nxsLog.success('Workspace release completed successfully.')
}
