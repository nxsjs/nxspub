import { runSafe } from './git'

/**
 * @en Check if a specific version already exists in the NPM registry.
 * @zh 检查指定版本是否已存在于 NPM 注册表。
 *
 * @param name
 * @en Package name (e.g., 'nxspub')
 * @zh 包名 (例如 'nxspub')
 *
 * @param version
 * @en Package version (e.g., '1.0.0')
 * @zh 包版本 (例如 '1.0.0')
 *
 * @param registry
 * @en Optional custom registry URL
 * @zh 可选的自定义注册表地址
 *
 * @returns
 * @en Returns true if the version exists, false otherwise.
 * @zh 如果版本存在返回 true，否则返回 false。
 */
export async function checkVersionExists(
  name: string,
  version: string,
  registry?: string,
) {
  try {
    const args = ['view', `${name}@${version}`, 'version']
    if (registry) {
      args.push('--registry', registry)
    }
    const { stdout } = await runSafe('npm', args)
    return !!stdout.trim()
  } catch {
    return false
  }
}
