import path from 'node:path'
import type { NxspubConfig } from '../config'
import type { ReleaseOptions } from './types'
import { ensureGitSync, getCurrentBranch, run } from '../utils/git'
import { cliLogger } from '../utils/logger'
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
    return
  }

  cliLogger.item(
    `Release Queue (${publicPackages.length}): ${publicPackages.map(p => p.name).join(', ')}`,
  )

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

  for (const packageInfo of publicPackages) {
    await releaseSingle(
      {
        ...options,
        cwd: packageInfo.dir,
        skipBuild: true,
      },
      config,
    )
  }

  cliLogger.success('Workspace release completed successfully.')
}
