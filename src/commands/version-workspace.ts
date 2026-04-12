import fs from 'node:fs/promises'
import path from 'node:path'
import * as semver from 'semver-es'
import type { BrancheType, NxspubConfig } from '../config'
import { formatDate } from '../utils/date'
import { getLastReleaseCommit, getRawCommits, run, runSafe } from '../utils/git'
import { nxsLog } from '../utils/logger'
import { readJSON } from '../utils/packages'

export async function versionWorkspace(
  options: { cwd: string; dry?: boolean },
  config: NxspubConfig,
) {
  const { cwd, dry } = options

  nxsLog.step('Scanning packages...')
  const packages = await scanPackages(cwd)

  const lastRelease = await getLastReleaseCommit()

  nxsLog.step('Detecting changes...')
  const changed = await detectChangedPackages(cwd, packages, lastRelease?.hash)

  const graph = buildDependencyGraph(packages)
  propagateChanges(changed, graph)

  if (changed.size === 0) {
    nxsLog.success('No changes.')
    return
  }

  const commits = await getRawCommits(lastRelease?.hash)

  const bumpMap = new Map<string, BrancheType>()

  for (const pkg of packages) {
    if (!changed.has(pkg.name)) continue

    let bump: BrancheType | null = null

    for (const { message } of commits) {
      if (config.versioning?.major?.some(r => new RegExp(r).test(message))) {
        bump = 'major'
        break
      }
      if (config.versioning?.minor?.some(r => new RegExp(r).test(message))) {
        bump = (bump as any) === 'major' ? bump : 'minor'
      }
      if (config.versioning?.patch?.some(r => new RegExp(r).test(message))) {
        bump = bump ?? 'patch'
      }
    }

    if (bump) bumpMap.set(pkg.name, bump)
  }

  const nextVersions = new Map<string, string>()

  for (const pkg of packages) {
    if (!bumpMap.has(pkg.name)) continue

    const next = semver.inc(
      pkg.version,
      bumpMap.get(pkg.name)! as semver.ReleaseType,
    )!
    nextVersions.set(pkg.name, next)

    nxsLog.item(`${pkg.name}: ${pkg.version} → ${next}`)
  }

  if (dry) {
    nxsLog.warn('DRY RUN')
    return
  }

  nxsLog.step('Updating versions...')
  for (const pkg of packages) {
    if (!nextVersions.has(pkg.name)) continue

    const pkgPath = path.join(pkg.dir, 'package.json')
    const json = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))

    json.version = nextVersions.get(pkg.name)
    await fs.writeFile(pkgPath, JSON.stringify(json, null, 2) + '\n')
  }

  await updateWorkspaceDeps(packages, nextVersions)

  await generateWorkspaceChangelog(cwd, commits, nextVersions, config)

  await run('pnpm', ['install'], { cwd })

  await commitAndTagWorkspace(cwd, nextVersions)
}

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

export async function detectChangedPackages(
  cwd: string,
  packages: { name: string; dir: string }[],
  since?: string,
) {
  const args = ['diff', '--name-only']
  if (since) args.push(`${since}..HEAD`)

  const { stdout } = await runSafe('git', args, { cwd })

  const files = stdout.split('\n').filter(Boolean)

  const changed = new Set<string>()

  for (const file of files) {
    for (const pkg of packages) {
      const rel = pkg.dir.replace(cwd + '/', '')
      if (file.startsWith(rel)) {
        changed.add(pkg.name)
      }
    }
  }

  return changed
}

export function buildDependencyGraph(packages: PackageInfo[]) {
  const graph = new Map<string, string[]>()

  for (const pkg of packages) {
    graph.set(pkg.name, pkg.dependencies)
  }

  return graph
}

export function propagateChanges(
  changed: Set<string>,
  graph: Map<string, string[]>,
) {
  let updated = true

  while (updated) {
    updated = false

    for (const [pkg, deps] of graph) {
      if (changed.has(pkg)) continue

      if (deps.some(dep => changed.has(dep))) {
        changed.add(pkg)
        updated = true
      }
    }
  }

  return changed
}

export async function updateWorkspaceDeps(
  packages: PackageInfo[],
  nextVersions: Map<string, string>,
) {
  for (const pkg of packages) {
    const pkgPath = path.join(pkg.dir, 'package.json')
    const json = JSON.parse(await fs.readFile(pkgPath, 'utf-8'))

    let changed = false

    const update = (deps?: Record<string, string>) => {
      if (!deps) return

      for (const dep in deps) {
        if (nextVersions.has(dep)) {
          deps[dep] = `^${nextVersions.get(dep)}`
          changed = true
        }
      }
    }

    update(json.dependencies)
    update(json.devDependencies)
    update(json.peerDependencies)

    if (changed) {
      await fs.writeFile(pkgPath, JSON.stringify(json, null, 2) + '\n')
    }
  }
}

export async function generateWorkspaceChangelog(
  cwd: string,
  commits: { message: string; hash: string }[],
  nextVersions: Map<string, string>,
  config: NxspubConfig,
) {
  const changelogPath = path.join(cwd, 'CHANGELOG.md')

  const date = formatDate()

  let content = `## Workspace Release (${date})\n\n`

  for (const [pkg, version] of nextVersions) {
    content += `### ${pkg}@${version}\n\n`

    for (const { message, hash } of commits) {
      const headerMatch = message.match(/^(\w+)(?:\(([^)]+)\))?:/)
      const type = headerMatch?.[1]

      const label = config.changelog?.labels?.[type || '']
      if (!label) continue

      content += `- ${message} (${hash.slice(0, 7)})\n`
    }

    content += '\n'
  }

  let existing = ''
  try {
    existing = await fs.readFile(changelogPath, 'utf-8')
  } catch {}

  await fs.writeFile(changelogPath, (content + '\n' + existing).trim() + '\n')
}

export async function commitAndTagWorkspace(
  cwd: string,
  nextVersions: Map<string, string>,
) {
  const message =
    'release(workspace): ' +
    Array.from(nextVersions.entries())
      .map(([name, v]) => `${name}@${v}`)
      .join(', ')

  nxsLog.step('Committing...')
  await run('git', ['add', '-A'], { cwd })
  await run('git', ['commit', '-m', message], { cwd })

  nxsLog.step('Tagging...')
  for (const [name, version] of nextVersions) {
    const tag = `${name}@${version}`
    nxsLog.item(tag)
    await run('git', ['tag', tag], { cwd })
  }

  nxsLog.step('Pushing...')
  await run('git', ['push'], { cwd })
  await run('git', ['push', '--tags'], { cwd })

  nxsLog.success('Done.')
}
