import { cac } from 'cac'
import pkg from '../package.json'
import { draftDoctorCommand } from './commands/draft-doctor'
import { gitHooksCommand } from './commands/git-hooks'
import { lintCommand } from './commands/lint'
import { releaseCommand } from './commands/release'
import type {
  CwdOptions,
  GitHooksOptions,
  LintOptions,
  ReleaseOptions,
  VersionOptions,
} from './commands/types'
import { versionCommand } from './commands/version'
import { handleCliError } from './utils/errors'
import { printBanner } from './utils/logger'

const cli = cac('nxspub')

function withCliErrorHandling<T>(runner: (options: T) => Promise<void>) {
  return async (options: T) => {
    try {
      await runner(options)
    } catch (error) {
      handleCliError(error)
    }
  }
}

cli
  .command('draft-doctor', 'Diagnose changelog draft health')
  .option('--cwd <cwd>', 'Specify the working directory', {
    default: process.cwd(),
  })
  .option('--target <version>', 'Target stable version (x.y.z)')
  .option('--prune', 'Remove stale drafts behind target version')
  .action(
    withCliErrorHandling(async options => {
      const typedOptions = options as CwdOptions & {
        target?: string
        prune?: boolean
      }
      await draftDoctorCommand(typedOptions)
    }),
  )

cli
  .command('git-hooks', 'Install git hooks')
  .option('--cwd <cwd>', 'Specify the working directory', {
    default: process.cwd(),
  })
  .option('--dry', 'Preview Mode')
  .action(
    withCliErrorHandling(async options => {
      const typedOptions = options as GitHooksOptions
      await gitHooksCommand(typedOptions)
    }),
  )

cli
  .command('lint', 'Lint commit message')
  .option('--cwd <cwd>', 'Specify the working directory', {
    default: process.cwd(),
  })
  .option('--edit <path>', 'Path to the commit message file')
  .action(
    withCliErrorHandling(async options => {
      const typedOptions = options as LintOptions
      await lintCommand(typedOptions)
    }),
  )

cli
  .command('version', 'Update the version and push the tag')
  .option('--cwd <cwd>', 'Specify the working directory', {
    default: process.cwd(),
  })
  .option('--dry', 'Preview Mode')
  .action(
    withCliErrorHandling(async options => {
      const typedOptions = options as VersionOptions
      printBanner()
      await versionCommand(typedOptions)
    }),
  )

cli
  .command('release', 'Build and publish to NPM')
  .option('--cwd <cwd>', 'Specify the working directory', {
    default: process.cwd(),
  })
  .option('--dry', 'Preview Mode')
  .option('--provenance', 'Generate provenance statements', { default: false })
  .option('--registry [url]', 'Override default registry')
  .option('--access [access]', 'public | restricted', { default: 'public' })
  .option('--tag [tag]', 'Override default tag')
  .option('--branch <branch>', 'Override default branch')
  .option('--skipBuild', 'Skip build', { default: false })
  .option('--skipSync', 'Skip remote git synchronization check', {
    default: false,
  })
  .action(
    withCliErrorHandling(async options => {
      const typedOptions = options as ReleaseOptions
      printBanner()
      await releaseCommand(typedOptions)
    }),
  )

cli.help()
cli.version(pkg.version)
cli.parse()
