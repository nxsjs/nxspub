import { defu } from 'defu'
import { createJiti } from 'jiti'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { NxspubConfig } from '../config'
import { DEFAULT_CONFIG } from '../config'
import { cliLogger } from './logger'
import { readJSON } from './packages'

/**
 * @en Initialize jiti to support loading TS/ESM config files on the fly.
 * @zh 初始化 jiti 以支持即时加载 TS/ESM 配置文件。
 */
const jiti = createJiti(import.meta.url)

/**
 * @en Load nxspub configuration from file, package.json, or defaults.
 * @zh 从配置文件、package.json 或默认设置中加载 nxspub 配置。
 *
 * @param cwd
 * @en Current working directory
 * @zh 当前工作目录
 *
 * @returns
 * @en Merged configuration object
 * @zh 合并后的配置对象
 */
export async function loadConfig(
  cwd: string = process.cwd(),
): Promise<NxspubConfig> {
  let fileConfig: NxspubConfig = {}
  let pkgConfig: NxspubConfig = {}

  const configFiles = [
    'nxspub.config.ts',
    'nxspub.config.mjs',
    'nxspub.config.js',
    'nxspub.config.cjs',
  ]

  for (const file of configFiles) {
    const fullPath = resolve(cwd, file)
    if (existsSync(fullPath)) {
      try {
        const mod = await jiti.import(fullPath)
        const config = mod as { default?: NxspubConfig } & NxspubConfig
        fileConfig = config.default || config
        break
      } catch (error) {
        if (process.env.NXSPUB_DEBUG) {
          cliLogger.dim(
            `Failed to load config file ${fullPath}: ${String(error)}`,
          )
        }
        continue
      }
    }
  }

  const pkgPath = resolve(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = await readJSON(pkgPath)
      if (pkg.nxspub) {
        pkgConfig = pkg.nxspub
      }
    } catch (error) {
      if (process.env.NXSPUB_DEBUG) {
        cliLogger.dim(`Failed to load package.json config: ${String(error)}`)
      }
    }
  }

  return defu(fileConfig, pkgConfig, DEFAULT_CONFIG) as NxspubConfig
}
