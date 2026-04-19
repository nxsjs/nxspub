import { abort } from '../utils/errors'
import { runSafe } from '../utils/git'
import { loadConfig } from '../utils/load-config'
import { cliLogger } from '../utils/logger'
import { versionSingle } from './version-single'
import type { VersionOptions } from './types'
import { versionWorkspace } from './version-workspace'

export async function versionCommand(options: VersionOptions) {
  const { cwd, dry } = options
  const config = await loadConfig(cwd)

  const { stdout: dirtyFiles } = await runSafe(
    'git',
    ['status', '--porcelain'],
    { cwd },
  )
  if (dirtyFiles && !dry) {
    cliLogger.error(
      'Uncommitted changes detected. Please commit or stash them before releasing.',
    )
    cliLogger.item('Files:\n' + dirtyFiles)
    abort(1)
  }

  if (config.workspace) {
    await versionWorkspace(options, config)
  } else {
    await versionSingle(options, config)
  }
}
