import fs from 'node:fs/promises'
import path from 'node:path'
import type { NxspubConfig } from '../config'
import { abort } from '../utils/errors'
import { resolveBranchType, getCurrentBranch } from '../utils/git'
import { cliLogger } from '../utils/logger'
import { normalizeRegExp } from '../utils/regexp'
import { determineBumpType } from '../utils/versions'

export async function lintCommitMsg(
  options: { cwd: string; edit: string },
  config: NxspubConfig,
) {
  const { cwd, edit } = options

  const msgPath = path.isAbsolute(edit) ? edit : path.resolve(cwd, edit)

  const fileExists = await fs
    .access(msgPath)
    .then(() => true)
    .catch(() => false)
  if (!fileExists) {
    cliLogger.error(`Could not find commit message file at: ${msgPath}`)
    abort(1)
  }

  const msg = (await fs.readFile(msgPath, 'utf-8')).trim()

  const rule = config.lint?.['commit-msg']
  if (rule) {
    let isValid: boolean = false

    if (typeof rule.pattern === 'function') {
      isValid = await rule.pattern(msg)
    } else {
      const regex = normalizeRegExp(rule.pattern)
      isValid = regex.test(msg)
    }

    if (typeof rule.message === 'function') {
      const result = await rule.message(isValid, msg)
      if (!isValid && typeof result === 'string') {
        cliLogger.error(result)
        abort(1)
      } else if (!isValid) {
        abort(1)
      }
    } else {
      if (!isValid) {
        cliLogger.error(rule.message)
        abort(1)
      }
    }
  }

  const currentBranch = await getCurrentBranch(cwd)
  const branchReleaseType =
    currentBranch && config.branches
      ? resolveBranchType(currentBranch, config.branches)
      : null

  if (branchReleaseType && branchReleaseType !== 'latest') {
    const bumpType = determineBumpType([{ message: msg }], config)
    if (bumpType) {
      const semverOrder: Record<string, number> = {
        patch: 1,
        prepatch: 1,
        minor: 2,
        preminor: 2,
        major: 3,
        premajor: 3,
        latest: 4,
      }

      const contractLevel = semverOrder[branchReleaseType] || 0
      const bumpLevel = semverOrder[bumpType] || 0

      if (bumpLevel > contractLevel) {
        cliLogger.error(
          `[Contract Violation] Branch "${currentBranch}" (Contract: ${branchReleaseType}) prohibits ${bumpType.toUpperCase()} commits.`,
        )
        abort(1)
      }
    }
  }

  cliLogger.success('Commit message style passed.')
}
