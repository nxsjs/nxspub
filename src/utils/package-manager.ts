import { existsSync } from 'node:fs'
import path from 'node:path'
import { nxsLog } from './logger'
import { readJSON } from './packages'

export type PackageManagerName = 'pnpm' | 'npm' | 'yarn'

export interface PackageManagerInfo {
  name: PackageManagerName
  version?: string
  runScript(bin: string, args?: string[]): { bin: string; args: string[] }
  install(): { bin: string; args: string[] }
  publish(args: string[]): { bin: string; args: string[] }
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
      nxsLog.dim(
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
