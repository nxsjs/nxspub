import { existsSync } from 'node:fs'
import path from 'node:path'
import { cliLogger } from './logger'
import { readJSON } from './packages'

export type PackageManagerName = 'pnpm' | 'npm' | 'yarn'

/**
 * @en Normalized package manager capabilities used by nxspub.
 * @zh nxspub 使用的标准化包管理器能力定义。
 */
export interface PackageManagerInfo {
  /** @en Package manager name. @zh 包管理器名称。 */
  name: PackageManagerName
  /** @en Optional package manager version. @zh 可选的包管理器版本。 */
  version?: string
  /** @en Build a run-script command descriptor. @zh 构造运行脚本命令描述。 */
  runScript(bin: string, args?: string[]): { bin: string; args: string[] }
  /** @en Build an install command descriptor. @zh 构造安装命令描述。 */
  install(): { bin: string; args: string[] }
  /** @en Build a publish command descriptor. @zh 构造发布命令描述。 */
  publish(args: string[]): { bin: string; args: string[] }
  /** @en Build default commit-msg hook command in development. @zh 构造开发环境默认 commit-msg hook 命令。 */
  devLintHook(): string
}

function parsePackageManager(
  value?: string,
): { name: PackageManagerName; version?: string } | null {
  if (!value) return null

  const match = value.match(/^(pnpm|npm|yarn)@(.+)$/)
  if (!match) return null

  return {
    name: match[1] as PackageManagerName,
    version: match[2],
  }
}

function createPackageManagerInfo(
  name: PackageManagerName,
  version?: string,
): PackageManagerInfo {
  return {
    name,
    version,
    runScript(script: string, args: string[] = []) {
      if (name === 'npm') {
        return {
          bin: 'npm',
          args: ['run', script, ...(args.length > 0 ? ['--', ...args] : [])],
        }
      }

      return {
        bin: name,
        args: ['run', script, ...args],
      }
    },
    install() {
      if (name === 'pnpm') {
        return { bin: 'pnpm', args: ['install', '--prefer-offline'] }
      }

      if (name === 'npm') {
        return { bin: 'npm', args: ['install'] }
      }

      return { bin: 'yarn', args: ['install'] }
    },
    publish(args: string[]) {
      if (name === 'yarn') {
        return { bin: 'npm', args: ['publish', ...args] }
      }

      return { bin: name, args: ['publish', ...args] }
    },
    devLintHook() {
      if (name === 'npm') {
        return 'npm run start -- lint --edit "$1"'
      }

      return `${name} run start lint --edit "$1"`
    },
  }
}

/**
 * @en Detect the active package manager by package.json metadata and lockfiles.
 * @zh 通过 package.json 元数据与锁文件检测当前使用的包管理器。
 *
 * @param cwd
 * @en Project root directory.
 * @zh 项目根目录。
 *
 * @returns
 * @en Detected package manager capabilities.
 * @zh 检测到的包管理器能力对象。
 */
export async function detectPackageManager(
  cwd: string,
): Promise<PackageManagerInfo> {
  try {
    const pkg = await readJSON(path.join(cwd, 'package.json'))
    const parsed = parsePackageManager(pkg.packageManager)
    if (parsed) {
      return createPackageManagerInfo(parsed.name, parsed.version)
    }
  } catch (error) {
    if (process.env.NXSPUB_DEBUG) {
      cliLogger.dim(
        `Failed to detect package manager from package.json: ${String(error)}`,
      )
    }
  }

  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    return createPackageManagerInfo('pnpm')
  }

  if (existsSync(path.join(cwd, 'yarn.lock'))) {
    return createPackageManagerInfo('yarn')
  }

  if (
    existsSync(path.join(cwd, 'package-lock.json')) ||
    existsSync(path.join(cwd, 'npm-shrinkwrap.json'))
  ) {
    return createPackageManagerInfo('npm')
  }

  return createPackageManagerInfo('npm')
}
