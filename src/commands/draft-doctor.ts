import * as semver from 'semver-es'
import path from 'node:path'
import { abort } from '../utils/errors'
import {
  analyzeDraftsForTargetVersion,
  readChangelogDrafts,
} from '../utils/changelog'
import { cliLogger } from '../utils/logger'
import { readJSON } from '../utils/packages'
import type { CwdOptions } from './types'

/**
 * @en Command options for draft-doctor command.
 * @zh draft-doctor 命令参数。
 */
export interface DraftDoctorOptions extends CwdOptions {
  /** @en Optional target stable version (x.y.z). @zh 可选目标稳定版本（x.y.z）。 */
  target?: string
}

function getCoreVersion(version: string): string {
  const prereleaseIndex = version.indexOf('-')
  return prereleaseIndex === -1 ? version : version.slice(0, prereleaseIndex)
}

/**
 * @en Diagnose changelog drafts against a target stable version.
 * @zh 基于目标稳定版本诊断 changelog 草稿状态。
 *
 * @param options
 * @en Command options with cwd and optional target version.
 * @zh 命令参数，包含 cwd 与可选目标版本。
 */
export async function draftDoctorCommand(options: DraftDoctorOptions) {
  const { cwd, target } = options
  const drafts = await readChangelogDrafts(cwd)
  if (drafts.length === 0) {
    cliLogger.success('No changelog drafts found.')
    return
  }

  let targetVersion = target
  if (!targetVersion) {
    const pkg = await readJSON(path.resolve(cwd, 'package.json'))
    targetVersion = getCoreVersion(String(pkg.version || ''))
  }

  if (!targetVersion || !semver.valid(targetVersion)) {
    cliLogger.error(
      `Invalid target version "${targetVersion || 'unknown'}". Use --target x.y.z.`,
    )
    abort(1)
  }

  const analysis = analyzeDraftsForTargetVersion(drafts, targetVersion)
  cliLogger.step(`Draft Health (target: ${targetVersion})`)
  cliLogger.item(`matching: ${analysis.matching.length}`)
  cliLogger.item(`behind: ${analysis.behind.length}`)
  cliLogger.item(`ahead: ${analysis.ahead.length}`)
  cliLogger.item(`invalid: ${analysis.invalid.length}`)

  if (analysis.behind.length > 0) {
    const sample = analysis.behind
      .slice(0, 5)
      .map(r => `${r.draft.branch}@${r.draft.version}`)
      .join(', ')
    cliLogger.warn(`Stale drafts sample: ${sample}`)
  }
  if (analysis.ahead.length > 0) {
    const sample = analysis.ahead
      .slice(0, 5)
      .map(r => `${r.draft.branch}@${r.draft.version}`)
      .join(', ')
    cliLogger.dim(`Future drafts sample: ${sample}`)
  }
}
