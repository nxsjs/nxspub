import detectIndent from 'detect-indent'
import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'

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
