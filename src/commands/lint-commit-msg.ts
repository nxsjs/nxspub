import fs from 'node:fs/promises'
import path from 'node:path'
import type { NxspubConfig } from '../config'
import { nxsLog } from '../utils/logger'
import { normalizeRegExp } from '../utils/regexp'

export async function lintCommitMsg(
  options: { cwd: string; edit: string },
  config: NxspubConfig,
) {
  const { cwd, edit } = options

  const msgPath = path.isAbsolute(edit) ? edit : path.resolve(cwd, edit)

  const isExists = await fs
    .access(msgPath)
    .then(() => true)
    .catch(() => false)
  if (!isExists) {
    nxsLog.error(`Could not find commit message file at: ${msgPath}`)
    process.exit(1)
  }

  const msg = (await fs.readFile(msgPath, 'utf-8')).trim()

  const rule = config.lint?.['commit-msg']
  if (!rule) return

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
      nxsLog.error(result)
      process.exit(1)
    } else if (!isValid) {
      process.exit(1)
    }
  } else {
    if (!isValid) {
      nxsLog.error(rule.message)
      process.exit(1)
    }
  }

  nxsLog.success('Commit message style passed.')
}
