/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { NxspubConfig } from '../config'
import { readJSON } from '../utils/packages'

export async function versionWorkspace(
  options: { cwd: string; dry?: boolean },
  config: NxspubConfig,
) {}

export interface PackageInfo {
  name: string
  version: string
  dir: string
  dependencies: string[]
}

export async function scanPackages(cwd: string): Promise<PackageInfo[]> {
  const pkgsDir = path.join(cwd, 'packages')
  const dirs = await fs.readdir(pkgsDir)

  const result: PackageInfo[] = []

  for (const dir of dirs) {
    const pkgPath = path.join(pkgsDir, dir, 'package.json')

    try {
      const json = await readJSON(pkgPath)

      result.push({
        name: json.name,
        version: json.version,
        dir: path.join(pkgsDir, dir),
        dependencies: Object.keys({
          ...json.dependencies,
          ...json.devDependencies,
          ...json.peerDependencies,
        }),
      })
    } catch {}
  }

  return result
}
