import { buildPreviewChecksReport, buildPreviewResult } from '../console/core'
import {
  startConsoleWebServer,
  validateConsoleHostPolicy,
} from '../console/server'
import type { ConsoleOptions } from './types'
import { NxspubError } from '../utils/errors'
import { cliLogger } from '../utils/logger'
import { runSafe } from '../utils/git'

function printPreviewSummary(
  preview: Awaited<ReturnType<typeof buildPreviewResult>>,
) {
  cliLogger.step('Preview Summary')
  cliLogger.item(`Mode: ${preview.mode}`)
  cliLogger.item(`Branch: ${preview.branch}`)
  cliLogger.item(
    `Policy: ${preview.policy.policy || 'unconfigured'}${preview.policy.ok ? '' : ' (blocked)'}`,
  )
  cliLogger.item(
    `Version: ${preview.currentVersion || '-'} -> ${preview.targetVersion || '-'}`,
  )
  cliLogger.item(`Commits: ${preview.commitCount}`)
  cliLogger.item(`Release Packages: ${preview.releasePackageCount}`)

  if (preview.packages?.length) {
    cliLogger.step('Workspace Plan')
    for (const item of preview.packages) {
      if (!item.nextVersion || item.nextVersion === item.currentVersion)
        continue
      const passiveMark = item.isPassive ? ' [PASSIVE]' : ''
      cliLogger.item(
        `${item.name}: ${item.currentVersion} -> ${item.nextVersion}${passiveMark}`,
      )
    }
  }

  if (preview.draftHealth) {
    cliLogger.step('Draft Health')
    cliLogger.item(`target: ${preview.draftHealth.target}`)
    cliLogger.item(`matching: ${preview.draftHealth.matching}`)
    cliLogger.item(`behind: ${preview.draftHealth.behind}`)
    cliLogger.item(`ahead: ${preview.draftHealth.ahead}`)
    cliLogger.item(`invalid: ${preview.draftHealth.invalid}`)
  }
}

async function openBrowserIfNeeded(url: string, shouldOpen?: boolean) {
  if (!shouldOpen) return

  const platform = process.platform
  try {
    if (platform === 'darwin') {
      await runSafe('open', [url])
      return
    }
    if (platform === 'win32') {
      await runSafe('cmd', ['/c', 'start', '', url])
      return
    }
    await runSafe('xdg-open', [url])
  } catch {
    cliLogger.warn(
      `Failed to open browser automatically. Open manually: ${url}`,
    )
  }
}

function isConsoleWebEnabled(): boolean {
  const rawFlag = process.env.NXSPUB_CONSOLE_WEB_ENABLED
  if (!rawFlag) return true
  const normalizedFlag = rawFlag.trim().toLowerCase()
  return !['0', 'false', 'off', 'no'].includes(normalizedFlag)
}

/**
 * @en Run console command in terminal mode or web mode.
 * @zh 运行 console 命令（终端模式或 Web 模式）。
 *
 * @param options
 * @en Console command options.
 * @zh console 命令参数。
 */
export async function consoleCommand(options: ConsoleOptions) {
  const {
    cwd,
    web,
    json,
    branch,
    host = '127.0.0.1',
    port = 4173,
    open,
    readonlyStrict,
    allowRemote,
    apiOnly,
  } = options

  if (web) {
    if (!isConsoleWebEnabled()) {
      throw new NxspubError(
        'console --web is disabled by NXSPUB_CONSOLE_WEB_ENABLED.',
      )
    }
    validateConsoleHostPolicy(host, allowRemote)
    const server = await startConsoleWebServer({
      cwd,
      host,
      port,
      readonlyStrict,
      apiOnly,
    })
    if (apiOnly) {
      cliLogger.step('Console API Token')
      cliLogger.item(`x-nxspub-console-token: ${server.token}`)
    }
    await openBrowserIfNeeded(server.url, open)
    return
  }

  const preview = await buildPreviewResult({
    cwd,
    branch,
    includeChangelog: true,
    includeChecks: false,
  })
  const checksReport = await buildPreviewChecksReport(cwd, preview)
  preview.checks = checksReport.items

  if (json) {
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`)
    return
  }

  printPreviewSummary(preview)
  if (preview.checks.length > 0) {
    cliLogger.step('Pre-release Checks')
    for (const check of preview.checks) {
      const marker = check.ok ? '[OK]' : '[RISK]'
      cliLogger.item(`${marker} ${check.title}: ${check.message}`)
    }
  }
}
