import chalk from 'chalk'

/**
 * @en Release type associated with a branch.
 * Defines how the version should be bumped when releasing from a specific branch.
 * @zh 分支关联的发布类型。定义从特定分支发布时应如何提升版本号。
 */
export type BranchType =
  | 'major' // Major release (1.0.0 -> 2.0.0)
  | 'minor' // Minor release (1.0.0 -> 1.1.0)
  | 'patch' // Patch release (1.0.0 -> 1.0.1)
  | 'latest' // Stable release (main/master)
  | 'premajor' // Pre-major release (1.0.0 -> 2.0.0-alpha.0)
  | 'preminor' // Pre-minor release (1.0.0 -> 1.1.0-alpha.0)
  | 'prepatch' // Pre-patch release (1.0.0 -> 1.0.1-alpha.0)

/**
 * @en Supported Git Hook names as defined in official Git documentation.
 * @zh Git 官方文档中支持的所有钩子名称。
 */
type GitHookType =
  | 'applypatch-msg'
  | 'pre-applypatch'
  | 'post-applypatch'
  | 'pre-commit'
  | 'pre-merge-commit'
  | 'prepare-commit-msg'
  | 'commit-msg'
  | 'post-commit'
  | 'pre-rebase'
  | 'post-checkout'
  | 'post-merge'
  | 'pre-push'
  | 'pre-receive'
  | 'update'
  | 'proc-receive'
  | 'post-receive'
  | 'post-update'
  | 'reference-transaction'
  | 'push-to-checkout'
  | 'pre-auto-gc'
  | 'post-rewrite'
  | 'sendemail-validate'
  | 'fsmonitor-watchman'
  | 'p4-changelist'
  | 'p4-prepare-changelist'
  | 'p4-post-changelist'
  | 'p4-pre-submit'
  | 'post-index-change'

/**
 * @en Workspace mode.
 * - 'locked': All packages share the same version (Fixed mode).
 * - 'independent': Packages are versioned individually.
 * @zh 工作区模式。
 * - 'locked': 固定模式（全家桶），所有包版本对齐。
 * - 'independent': 独立模式，每个包单独计算版本。
 * @default locked
 */
export type WorkspaceMode = 'locked' | 'independent'

/**
 * @en Strategy for passive version bumps when dependencies change.
 * - 'patch': Always bump a patch version (Default).
 * - 'follow': Follow the highest bump type of its dependencies.
 * - 'none': Do not bump version or modify package.json.
 * @zh 当依赖变动时的被动升级策略。
 * - 'patch': 统一升级补丁版本（默认）。
 * - 'follow': 跟随依赖项中最高的升级类型。
 * - 'none': 不自动升级，也不改写该包的文件。
 * @default patch
 */
export type WorkspacePassive = 'patch' | 'follow' | 'none'

/**
 * @en Supported deploy provider names in config.
 * @zh 配置中支持的 deploy provider 名称。
 */
export type DeployProviderName =
  | 'vercel'
  | 'cloudflare'
  | 'onepanel'
  | 'btpanel'
  | 'ssh'
  | 'rancher'
  | 'k8s'
  | 'custom'

/**
 * @en Main configuration interface for nxspub.
 * @zh nxspub 的核心配置接口。
 */
export interface NxspubConfig {
  workspace?: {
    /**
     * @en Workspace mode.
     * - 'locked': All packages share the same version (Fixed mode).
     * - 'independent': Packages are versioned individually.
     * @zh 工作区模式。
     * - 'locked': 固定模式（全家桶），所有包版本对齐。
     * - 'independent': 独立模式，每个包单独计算版本。
     * @default locked
     */
    mode: WorkspaceMode

    /**
     * @en Strategy for passive version bumps when dependencies change.
     * - 'patch': Always bump a patch version (Default).
     * - 'follow': Follow the highest bump type of its dependencies.
     * - 'none': Do not bump version or modify package.json.
     * @zh 当依赖变动时的被动升级策略。
     * - 'patch': 统一升级补丁版本（默认）。
     * - 'follow': 跟随依赖项中最高的升级类型。
     * - 'none': 不自动升级，也不改写该包的文件。
     * @default patch
     */
    passive?: WorkspacePassive
  }

  /**
   * @en Mapping of branch patterns to release types.
   * @zh 分支模式与发布类型的映射关系。
   * @example { "main": "latest", "alpha/*": "preminor" }
   */
  branches?: Record<string, BranchType>

  /**
   * @en Custom rules to determine the version bump based on commit messages.
   * @zh 基于提交信息确定版本提升规则的自定义配置。
   */
  versioning?: {
    /** @en Rules for Major bump @zh 触发 Major 提升的规则 */
    major?: (string | RegExp)[]
    /** @en Rules for Minor bump @zh 触发 Minor 提升的规则 */
    minor?: (string | RegExp)[]
    /** @en Rules for Patch bump @zh 触发 Patch 提升的规则 */
    patch?: (string | RegExp)[]
  }

  /**
   * @en Changelog generation settings.
   * @zh 变更日志（Changelog）生成设置。
   */
  changelog?: {
    /**
     * @en Mapping of commit types to display labels in the changelog.
     * @zh 提交类型在变更日志中显示的标签映射。
     * @example { "feat": "🚀 Features", "fix": "🐛 Bug Fixes" }
     */
    labels?: Record<string, string>

    /**
     * @en Optional branch allowlist for changelog writes.
     * When configured, changelog files are only written on these branches.
     * @zh 可选的变更日志写入分支白名单。
     * 配置后，仅在这些分支上写入 changelog 文件。
     * @example ["main", "master"]
     */
    writeOnBranches?: string[]
  }

  /**
   * @en Custom linting rules for Git hooks.
   * @zh Git 钩子的自定义 lint 规则。
   */
  lint?: {
    /**
     * @en Regular expression to validate commit messages in the 'commit-msg' hook.
     * @zh 用于 'commit-msg' 钩子验证提交信息的正则表达式。
     */
    'commit-msg'?: {
      pattern: string | RegExp | ((msg: string) => boolean | Promise<boolean>)
      message:
        | string
        | ((
            isValid: boolean,
            msg: string,
          ) => void | string | Promise<void | string>)
    }
  }

  /**
   * @en Custom scripts for specific git hooks.
   * Use [Partial] to allow defining only the hooks you need.
   * @zh 特定 Git 钩子的自定义脚本。使用 [Partial] 允许用户仅定义需要的钩子。
   * @example { "commit-msg": "nxspub lint --edit $1" }
   */
  'git-hooks'?: Partial<Record<GitHookType, string>>

  /**
   * @en Custom lifecycle scripts.
   * @zh 自定义生命周期脚本。
   */
  scripts?: {
    /**
     * @en Command to run for building the project before release.
     * If provided, it overrides the default "pnpm run build".
     * @zh 发布前执行的项目构建命令。如果提供，将覆盖默认的 "pnpm run build"。
     */
    releaseBuild?: string

    /**
     * @en Command executed after changelog generation and before git commit in `nxspub version`.
     * @zh 在 `nxspub version` 中，changelog 生成后、git commit 前执行的命令。
     */
    beforeVersionCommit?: string
  }

  /**
   * @en Deployment orchestration configuration.
   * @zh 部署编排配置。
   */
  deploy?: {
    /**
     * @en Enable/disable deploy command.
     * @zh 启用/禁用 deploy 命令。
     */
    enabled?: boolean
    /**
     * @en Default target environment.
     * @zh 默认目标环境。
     */
    defaultEnvironment?: string
    /**
     * @en Branch-to-environment mapping.
     * @zh 分支到环境映射。
     */
    branchEnvironmentMap?: Record<string, string>
    /**
     * @en Deploy provider configuration.
     * @zh 部署 provider 配置。
     */
    provider?: {
      /**
       * @en Provider name.
       * @zh Provider 名称。
       */
      name?: DeployProviderName
      /**
       * @en Provider custom config payload.
       * @zh Provider 自定义配置载荷。
       */
      config?: Record<string, unknown>
    }
    /**
     * @en Environment-specific deploy settings.
     * @zh 环境级部署设置。
     */
    environments?: Record<
      string,
      {
        /**
         * @en Default strategy for the environment.
         * @zh 环境默认部署策略。
         */
        strategy?: 'rolling' | 'canary' | 'blue-green'
        /**
         * @en Verification settings.
         * @zh 校验设置。
         */
        verify?: {
          healthEndpoint?: string
          timeoutMs?: number
          successThreshold?: number
        }
        /**
         * @en Approval settings.
         * @zh 审批设置。
         */
        approval?: {
          required?: boolean
          channel?: string
        }
      }
    >
    /**
     * @en Promotion constraints between environments.
     * @zh 环境晋级约束。
     */
    promotion?: {
      /**
       * @en Require production deploy to match digest from source environment.
       * @zh 要求 production 部署与来源环境的 digest 完全一致。
       * @default true
       */
      requireSameArtifactDigest?: boolean
      /**
       * @en Source environment used for promotion verification.
       * @zh 用于晋级校验的来源环境。
       * @default staging
       */
      sourceEnvironment?: string
    }
  }
}

export const DEFAULT_CONFIG: NxspubConfig = {
  branches: {
    main: 'latest',
    master: 'latest',
  },
  versioning: {
    major: [/(\w+)\((.+)\)!:/, /(\w+)!:/, /BREAKING CHANGE:/],
    minor: [/feat\((.+)\):/, /feat:/],
    patch: [
      /fix\((.+)\):/,
      /fix:/,
      /perf\((.+)\):/,
      /perf:/,
      /refactor\((.+)\):/,
      /refactor:/,
    ],
  },
  changelog: {
    labels: {
      feat: 'Features',
      fix: 'Bug Fixes',
      perf: 'Performance Improvements',
      refactor: 'Refactors',
      revert: 'Reverts',
    },
    writeOnBranches: ['main', 'master'],
  },
  lint: {
    'commit-msg': {
      pattern:
        /^(revert: )?(feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release)(\([^)]+\))?(!)?: .{1,50}/,
      message: (isValid: boolean) => {
        if (isValid) return
        console.error(
          `\n  ${chalk.white(chalk.bgRed(' ERROR '))} ${chalk.red(
            `Invalid commit message format.`,
          )}\n\n` +
            chalk.red(
              `  Proper commit message format is required for automated changelog generation.\n` +
                `  Examples:\n\n`,
            ) +
            `    ${chalk.green(`feat(core)!: add support for new plugin system`)}\n` +
            `    ${chalk.green(`fix(nxsjs): resolve reactivity leak in dev mode`)}\n\n` +
            chalk.red(`  Please follow the Conventional Commits standard.\n`),
        )
      },
    },
  },
}
