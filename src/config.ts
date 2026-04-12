/**
 * @en Release type associated with a branch.
 * Defines how the version should be bumped when releasing from a specific branch.
 * @zh 分支关联的发布类型。定义从特定分支发布时应如何提升版本号。
 */
export type BrancheType =
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
 * @en Main configuration interface for nxspub.
 * @zh nxspub 的核心配置接口。
 */
export interface NxspubConfig {
  /**
   * @en Whether the project is a monorepo workspace.
   * @zh 项目是否为 Monorepo 工作区。
   */
  workspace?: boolean
  /**
   * @en Mapping of branch patterns to release types.
   * @zh 分支模式与发布类型的映射关系。
   * @example { "main": "latest", "alpha/*": "preminor" }
   */
  branches?: Record<string, BrancheType>
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
  }
}

export const DEFAULT_CONFIG: NxspubConfig = {
  workspace: false,

  branches: {
    main: 'latest',
    master: 'latest',
    alpha: 'preminor',
    beta: 'preminor',
    rc: 'preminor',
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
  },
}
