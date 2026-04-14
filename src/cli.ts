import { cac } from 'cac'
import pkg from '../package.json'
import { gitHooksCommand } from './commands/git-hooks'
import { lintCommand } from './commands/lint'
import { releaseCommand } from './commands/release'
import { versionCommand } from './commands/version'
import { printBanner } from './utils/logger'

const cli = cac('nxspub')

cli
  .command('git-hooks', 'Install git hooks')
  .option('--cwd <cwd>', 'Specify the working directory', {
    default: process.cwd(),
  })
  .option('--dry', 'Preview Mode')
  .action(async options => {
    await gitHooksCommand(options)
  })

cli
  .command('lint', 'Lint commit message')
  .option('--cwd <cwd>', 'Specify the working directory', {
    default: process.cwd(),
  })
  .option('--edit <path>', 'Path to the commit message file')
  .action(async options => {
    await lintCommand(options)
  })

cli
  .command('version', 'Update the version and push the tag')
  .option('--cwd <cwd>', 'Specify the working directory', {
    default: process.cwd(),
  })
  .option('--dry', 'Preview Mode')
  .action(async options => {
    printBanner()
    await versionCommand(options)
  })

cli
  .command('release', 'Build and publish to NPM')
  .option('--cwd <cwd>', 'Specify the working directory', {
    default: process.cwd(),
  })
  .option('--dry', 'Preview Mode')
  .option('--provenance', 'Generate provenance statements', { default: false })
  .option('--registry <url>', 'Override default registry')
  .option('--access <access>', 'public | restricted', { default: 'public' })
  .option('--tag <tag>', 'Override default tag')
  .option('--branch <branch>', 'Override default branch')
  .option('--skipBuild <skipBuild>', 'Skip build', { default: false })
  .action(async options => {
    printBanner()
    await releaseCommand(options)
  })

cli.help()
cli.version(pkg.version)
cli.parse()
