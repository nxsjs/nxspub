import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import { nxsLog } from '../utils/logger'

export async function lintCommitMsg(options: { cwd: string; edit: string }) {
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

  const commitRE =
    /^(revert: )?(feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release)(\([^)]+\))?(!)?: .{1,50}/

  if (!commitRE.test(msg)) {
    console.error(
      `\n  ${chalk.white(chalk.bgRed(' ERROR '))} ${chalk.red(
        `Invalid commit message format.`,
      )}\n\n` +
        chalk.red(
          `  Proper commit message format is required for automated changelog generation.\n` +
            `  Examples:\n\n`,
        ) +
        `    ${chalk.green(`feat(core)!: add support for new plugin system`)}\n` +
        `    ${chalk.green(`fix(nxsjs): resolve reactivity leak in dev mode`)}\n\n` +
        chalk.red(`  Please follow the Conventional Commits standard.\n`),
    )
    process.exit(1)
  }

  nxsLog.success('Commit message style passed.')
}
