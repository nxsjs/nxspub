import type { NxspubConfig } from './config'

/**
 * @en Define and return nxspub configuration with type inference support.
 * @zh 定义并返回 nxspub 配置，支持完整类型推导。
 *
 * @param config
 * @en User provided nxspub config object.
 * @zh 用户提供的 nxspub 配置对象。
 *
 * @returns
 * @en The same config object.
 * @zh 原样返回的配置对象。
 */
export function defineConfig(config: NxspubConfig): NxspubConfig {
  return config
}
