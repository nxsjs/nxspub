import { NxspubError } from '../utils/errors'
import { run, runSafe } from '../utils/git'
import type {
  DeployExecuteInput,
  DeployPlan,
  DeployPlanInput,
  DeployProviderAdapter,
  DeployProviderName,
  DeployRollbackInput,
  DeployResult,
  DeployRiskLevel,
  RollbackResult,
} from './types'

interface ShellProviderCommandConfig {
  validate?: string
  plan?: string
  execute?: string
  rollback?: string
}

interface ShellProviderConfig {
  commands?: ShellProviderCommandConfig
  requiredEnv?: string[]
  env?: Record<string, string>
  tokenEnv?: string
  apiTokenEnv?: string
  apiKeyEnv?: string
  passwordEnv?: string
  privateKeyPath?: string
  baseUrl?: string
  serverUrl?: string
}

const SUPPORTED_PROVIDERS: DeployProviderName[] = [
  'vercel',
  'cloudflare',
  'onepanel',
  'btpanel',
  'ssh',
  'rancher',
  'k8s',
  'custom',
]

function now(): string {
  return new Date().toISOString()
}

function buildDefaultPlan(input: DeployPlanInput): DeployPlan {
  return {
    env: input.env,
    strategy: input.strategy,
    mode: input.mode,
    branch: input.branch,
    artifacts: input.artifacts,
    checks: [
      {
        id: 'provider',
        ok: true,
        level: 'info' satisfies DeployRiskLevel,
        message: 'Provider adapter ready.',
      },
    ],
  }
}

function buildBaseShellEnv(
  input:
    | DeployPlanInput
    | DeployExecuteInput
    | (DeployRollbackInput & { strategy?: string }),
): Record<string, string> {
  const extra: Record<string, string> = {
    NXSPUB_DEPLOY_ENV: input.env,
    NXSPUB_DEPLOY_DEPLOYMENT_ID:
      'deploymentId' in input ? input.deploymentId : '',
  }
  if ('strategy' in input && input.strategy) {
    extra.NXSPUB_DEPLOY_STRATEGY = input.strategy
  }
  if ('branch' in input) {
    extra.NXSPUB_DEPLOY_BRANCH = input.branch
  }
  if ('artifacts' in input) {
    extra.NXSPUB_DEPLOY_ARTIFACTS_JSON = JSON.stringify(input.artifacts)
  }
  if ('rollbackTo' in input) {
    extra.NXSPUB_DEPLOY_ROLLBACK_TO = input.rollbackTo
  }
  return extra
}

function resolveBuiltinRequiredEnv(
  providerName: DeployProviderName,
  config: ShellProviderConfig,
): string[] {
  if (providerName === 'vercel') {
    return [config.tokenEnv || 'VERCEL_TOKEN']
  }
  if (providerName === 'cloudflare') {
    return [config.apiTokenEnv || 'CLOUDFLARE_API_TOKEN']
  }
  if (providerName === 'onepanel') {
    return [config.apiKeyEnv || 'ONEPANEL_API_KEY']
  }
  if (providerName === 'btpanel') {
    return [config.apiKeyEnv || 'BT_API_KEY']
  }
  if (providerName === 'rancher') {
    return [config.tokenEnv || 'RANCHER_TOKEN']
  }
  return []
}

function validateBuiltinProviderConfig(
  providerName: DeployProviderName,
  config: ShellProviderConfig,
) {
  if (providerName === 'onepanel' || providerName === 'btpanel') {
    if (!config.baseUrl) {
      throw new NxspubError(
        `Provider "${providerName}" requires deploy.provider.config.baseUrl.`,
        2,
        { silent: false },
      )
    }
  }
  if (providerName === 'rancher' && !config.serverUrl) {
    throw new NxspubError(
      'Provider "rancher" requires deploy.provider.config.serverUrl.',
      2,
      { silent: false },
    )
  }
  if (providerName === 'ssh') {
    if (!config.privateKeyPath && !config.passwordEnv) {
      throw new NxspubError(
        'Provider "ssh" requires either deploy.provider.config.privateKeyPath or deploy.provider.config.passwordEnv.',
        2,
        { silent: false },
      )
    }
  }
}

async function runShellCommand(
  command: string,
  cwd: string,
  env: Record<string, string>,
  inherit: boolean,
) {
  const opts = {
    cwd,
    shell: true,
    env,
  }
  if (inherit) {
    await run(command, [], opts)
    return
  }
  await runSafe(command, [], opts)
}

/**
 * @en Build deploy provider adapter by provider name and config.
 * @zh 根据 provider 名称和配置构建部署适配器。
 */
export function createDeployProviderAdapter(
  name: string,
  rawConfig: unknown,
): DeployProviderAdapter {
  const providerName = name as DeployProviderName
  if (!SUPPORTED_PROVIDERS.includes(providerName)) {
    throw new NxspubError(`Unsupported deploy provider: "${name}".`, 2, {
      silent: false,
    })
  }

  const config = (rawConfig || {}) as ShellProviderConfig
  const commands = config.commands || {}
  const staticEnv = config.env || {}
  const requiredEnv = [
    ...resolveBuiltinRequiredEnv(providerName, config),
    ...(config.requiredEnv || []),
  ]

  const ensureRequiredEnv = () => {
    validateBuiltinProviderConfig(providerName, config)
    const missing = requiredEnv.filter(key => !process.env[key])
    if (missing.length > 0) {
      throw new NxspubError(
        `Missing required environment variables for deploy provider "${providerName}": ${missing.join(', ')}`,
        2,
        { silent: false },
      )
    }
  }

  return {
    name: providerName,
    async validate() {
      ensureRequiredEnv()
      if (commands.validate) {
        await runShellCommand(
          commands.validate,
          process.cwd(),
          {
            ...process.env,
            ...staticEnv,
          } as Record<string, string>,
          false,
        )
      }
    },
    async plan(input) {
      const plan = buildDefaultPlan(input)
      if (commands.plan) {
        await runShellCommand(
          commands.plan,
          input.cwd,
          {
            ...process.env,
            ...staticEnv,
            ...buildBaseShellEnv(input),
          } as Record<string, string>,
          false,
        )
      }
      return plan
    },
    async execute(input) {
      if (input.dry) {
        return {
          deploymentId: input.deploymentId,
          status: 'success',
          deployed: input.artifacts.map(item => ({
            name: item.name,
            version: item.version,
          })),
          skipped: [],
          failed: [],
          timeline: [
            { step: 'validate', status: 'success', at: now() },
            {
              step: 'deploy',
              status: 'success',
              at: now(),
              message: 'Dry-run mode: no runtime mutation.',
            },
            { step: 'finalize', status: 'success', at: now() },
          ],
        } satisfies DeployResult
      }

      if (!commands.execute) {
        throw new NxspubError(
          `Provider "${providerName}" missing execute command in deploy.provider.config.commands.execute.`,
          2,
          { silent: false },
        )
      }

      await runShellCommand(
        commands.execute,
        input.cwd,
        {
          ...process.env,
          ...staticEnv,
          ...buildBaseShellEnv(input),
        } as Record<string, string>,
        true,
      )

      return {
        deploymentId: input.deploymentId,
        status: 'success',
        deployed: input.artifacts.map(item => ({
          name: item.name,
          version: item.version,
        })),
        skipped: [],
        failed: [],
        timeline: [
          { step: 'validate', status: 'success', at: now() },
          { step: 'prepare', status: 'success', at: now() },
          { step: 'deploy', status: 'success', at: now() },
          { step: 'verify', status: 'success', at: now() },
          { step: 'finalize', status: 'success', at: now() },
        ],
      } satisfies DeployResult
    },
    async rollback(input) {
      if (!commands.rollback) {
        throw new NxspubError(
          `Provider "${providerName}" missing rollback command in deploy.provider.config.commands.rollback.`,
          2,
          { silent: false },
        )
      }

      await runShellCommand(
        commands.rollback,
        input.cwd,
        {
          ...process.env,
          ...staticEnv,
          ...buildBaseShellEnv(input),
        } as Record<string, string>,
        true,
      )

      return {
        deploymentId: input.deploymentId,
        rollbackTo: input.rollbackTo,
        status: 'success',
        timeline: [
          { step: 'validate', status: 'success', at: now() },
          { step: 'rollback', status: 'success', at: now() },
          { step: 'finalize', status: 'success', at: now() },
        ],
      } satisfies RollbackResult
    },
  }
}
