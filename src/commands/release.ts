import { loadConfig } from '../utils/load-config'
import { releaseSingle } from './release-single'

export async function releaseCommand(options: any) {
  const config = await loadConfig(options.cwd)

  await releaseSingle(options, config)
}
