import { runSafe } from '../utils/git'
import { loadConfig } from '../utils/load-config'
import { nxsLog } from '../utils/logger'
import { versionSingle } from './version-single'
import { versionWorkspace } from './version-workspace'

export async function versionCommand(options: { cwd: string; dry?: boolean }) {
  const { cwd, dry } = options
  const config = await loadConfig(cwd)

  const { stdout: dirtyFiles } = await runSafe(
    'git',
    ['status', '--porcelain'],
    { cwd },
  )
  if (dirtyFiles && !dry) {
    nxsLog.error(
      'Uncommitted changes detected. Please commit or stash them before releasing.',
    )
    nxsLog.item('Files:\n' + dirtyFiles)
    process.exit(1)
  }

  if (config.workspace) {
    await versionWorkspace(options, config)
  } else {
    await versionSingle(options, config)
  }
}
