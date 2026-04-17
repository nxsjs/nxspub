import detectIndent from 'detect-indent'
import fg from 'fast-glob'
import yaml from 'js-yaml'
import { promises as fs } from 'node:fs'
import path, { resolve } from 'node:path'
import type { BrancheType } from '../config'
import { nxsLog } from './logger'

/**
 * @en Read and parse a JSON file.
 * @zh 异步读取并解析 JSON 文件。
 *
 * @param filepath
 * @en Target file path
 * @zh 目标文件路径
 */
export async function readJSON(filepath: string) {
  const content = await fs.readFile(filepath, 'utf-8')
  return JSON.parse(content)
}

/**
 * @en Write a JSON file while preserving the original indentation style.
 * @zh 异步写入 JSON 文件，并自动保持原文件的缩进风格。
 *
 * @param filepath
 * @en Target file path
 * @zh 目标文件路径
 *
 * @param data
 * @en The data object to be written.
 * @zh 需要写入的数据对象
 */
export async function writeJSON(filepath: string, data: any) {
  let fileIndent = '  '
  try {
    const actualContent = await fs.readFile(filepath, 'utf-8')
    fileIndent = detectIndent(actualContent).indent || '  '
  } catch {
    // ignore
  }

  return await fs.writeFile(
    filepath,
    `${JSON.stringify(data, null, fileIndent)}\n`,
    'utf-8',
  )
}

/**
 * @en Metadata for package.json projects.
 * @zh 针对 package.json 项目的元数据。
 */
export interface PackageMeta {
  /** @en The type identifier @zh 类型标识 */
  type: 'package.json'
  /** @en The package name @zh 包名 */
  name: string
  /** @en The current version @zh 当前版本号 */
  version: string
  /** @en Whether the package is private @zh 是否为私有包 */
  private: boolean
  /** @en The absolute file path @zh 文件的绝对路径 */
  filepath: string
  /** @en The relative path @zh 相对项目根目录的路径 */
  relative: string
  /** @en The raw JSON object @zh 原始 JSON 对象，用于直接修改内容 */
  raw: Record<string, any>
}

/**
 * @en Metadata for pnpm-workspace.yaml.
 * @zh 针对 pnpm-workspace.yaml 的元数据。
 */
export interface PnpmWorkspaceMeta {
  /** @en The type identifier @zh 类型标识 */
  type: 'pnpm-workspace.yaml'
  /** @en The absolute file path @zh 文件的绝对路径 */
  filepath: string
  /** @en The raw YAML content @zh 解析后的 YAML 内容 */
  raw: Record<string, any>
}

/**
 * @en Union type for supported project metadata.
 * @zh 支持的项目元数据联合类型。
 */
export type ProjectMeta = PackageMeta | PnpmWorkspaceMeta

/**
 * @en Load and parse a package.json file into PackageMeta format.
 * @zh 加载并解析 package.json 文件为 PackageMeta 格式。
 *
 * @param relative
 * @en Relative path to the package.json
 * @zh 相对于根目录的路径
 *
 * @param cwd
 * @en Current working directory
 * @zh 当前工作目录
 */
export async function loadPackageJSON(
  relative: string,
  cwd: string = process.cwd(),
): Promise<PackageMeta> {
  const filepath = resolve(cwd, relative)
  const raw = await readJSON(filepath)

  return {
    type: 'package.json',
    name: raw.name,
    version: raw.version,
    private: !!raw.private,
    relative,
    filepath,
    raw,
  }
}

/**
 * @en Save the modified PackageMeta back to its file.
 * @zh 将修改后的 PackageMeta 保存回文件。
 *
 * @param pkg
 * @en The PackageMeta object to save
 * @zh 要保存的元数据对象
 */
export async function savePackageJSON(pkg: PackageMeta) {
  return await writeJSON(pkg.filepath, pkg.raw)
}

/**
 * @en Basic metadata scanned from the file system.
 * @zh 从文件系统扫描到的基础元数据。
 */
export interface PackageInfo {
  /** @en Name of the package from package.json. @zh 来自 package.json 的包名。 */
  name: string
  /** @en Current version of the package. @zh 包的当前版本。 */
  version: string
  /** @en Whether the package is marked as private. @zh 是否为私有包。 */
  private: boolean
  /** @en Absolute path to the package directory. @zh 包目录的绝对路径。 */
  dir: string
  /** @en Relative path from the workspace root. @zh 相对于工作区根目录的路径。 */
  relativeDir: string
  /** @en Absolute path to the package.json file. @zh package.json 文件的绝对路径。 */
  pkgPath: string
  /** @en Absolute path to the CHANGELOG.md file. @zh CHANGELOG.md 文件的绝对路径。 */
  changelogPath: string
  /** @en Directory for archived changelog files. @zh 归档日志文件的目录。 */
  archiveDir: string
  /** @en List of dependency names. @zh 依赖项名称列表。 */
  dependencies: string[]
}

/**
 * @en Full versioning task with runtime state.
 * @zh 带有运行时状态的完整版本管理任务。
 */
export interface PackageTask extends PackageInfo {
  /** @en Git commits since last release. @zh 自上次发布以来的 Git 提交。 */
  commits: { message: string; hash: string }[]
  /** @en Determined bump type. @zh 确定的升级类型。 */
  bumpType: BrancheType | null
  /** @en Triggered by dependency change. @zh 是否由依赖变动被动触发。 */
  isPassive: boolean
  /** @en Reasons for passive trigger. @zh 依赖变动被动触发的原因。 */
  passiveReasons?: string[]
  /** @en Calculated next version. @zh 计算出的新版本。 */
  nextVersion?: string
}

export async function scanWorkspacePackages(
  cwd: string,
): Promise<PackageInfo[]> {
  let patterns: string[] = ['packages/*']

  try {
    const yamlContent = await fs.readFile(
      path.join(cwd, 'pnpm-workspace.yaml'),
      'utf8',
    )
    const yamlData = yaml.load(yamlContent) as any
    if (yamlData?.packages) patterns = yamlData.packages
  } catch {
    try {
      const rootPkg = await readJSON(path.join(cwd, 'package.json'))
      if (Array.isArray(rootPkg.workspaces)) patterns = rootPkg.workspaces
      else if (rootPkg.workspaces?.packages)
        patterns = rootPkg.workspaces.packages
    } catch {}
  }

  const globPatterns = patterns.map(p => {
    const base = p.replace(/\/$/, '')
    return base.startsWith('!')
      ? `!${base.slice(1)}/package.json`
      : `${base}/package.json`
  })

  const files = await fg(globPatterns, {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**'],
  })

  const results: PackageInfo[] = []
  for (const file of files) {
    try {
      const raw = await readJSON(file)

      if (file === path.join(cwd, 'package.json')) continue

      const dir = path.dirname(file)
      results.push({
        name: raw.name,
        version: raw.version || '0.0.0',
        private: !!raw.private,
        dir,
        relativeDir: path.relative(cwd, dir),
        pkgPath: file,
        changelogPath: path.join(dir, 'CHANGELOG.md'),
        archiveDir: path.join(dir, 'changelogs'),
        dependencies: Object.keys({
          ...raw.dependencies,
          ...raw.devDependencies,
          ...raw.peerDependencies,
          ...raw.optionalDependencies,
          ...raw.resolutions,
          ...raw.overrides,
          ...raw.pnpm?.overrides,
        }),
      })
    } catch {}
  }
  return results
}

export function topologicalSort(tasks: Map<string, PackageTask>): string[] {
  const nodes = Array.from(tasks.keys())
  const sorted: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(name: string) {
    if (visiting.has(name)) {
      nxsLog.error(
        `Circular dependency: ${Array.from(visiting).join(' -> ')} -> ${name}`,
      )
      process.exit(1)
    }
    if (!visited.has(name)) {
      visiting.add(name)
      const task = tasks.get(name)
      if (task) {
        for (const dep of task.dependencies) if (tasks.has(dep)) visit(dep)
      }
      visiting.delete(name)
      visited.add(name)
      sorted.push(name)
    }
  }

  for (const node of nodes) visit(node)
  return sorted
}
