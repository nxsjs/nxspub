/**
 * @en Base options with working directory.
 * @zh 包含工作目录的基础命令参数。
 */
export interface CwdOptions {
  /** @en Current working directory. @zh 当前工作目录。 */
  cwd: string
}

/**
 * @en Base options supporting dry-run mode.
 * @zh 支持 dry-run 模式的基础命令参数。
 */
export interface DryRunOptions extends CwdOptions {
  /** @en Run without persisting changes. @zh 仅预览，不落盘变更。 */
  dry?: boolean
}

/**
 * @en Command options for git-hooks command.
 * @zh git-hooks 命令参数。
 */
export interface GitHooksOptions extends DryRunOptions {}

/**
 * @en Command options for lint command.
 * @zh lint 命令参数。
 */
export interface LintOptions extends CwdOptions {
  /** @en Commit message file path. @zh 提交信息文件路径。 */
  edit?: string
}

/**
 * @en Command options for version command.
 * @zh version 命令参数。
 */
export interface VersionOptions extends DryRunOptions {}

/**
 * @en Command options for release command.
 * @zh release 命令参数。
 */
export interface ReleaseOptions extends DryRunOptions {
  /** @en Enable npm provenance publishing. @zh 启用 npm provenance 发布。 */
  provenance?: boolean
  /** @en Custom npm registry URL. @zh 自定义 npm 注册表地址。 */
  registry?: string
  /** @en Publish access level. @zh 发布访问级别。 */
  access?: string
  /** @en Publish dist-tag override. @zh 发布 dist-tag 覆盖值。 */
  tag?: string
  /** @en Explicit branch name override. @zh 显式分支名覆盖值。 */
  branch?: string
  /** @en Skip build step before publish. @zh 发布前跳过构建。 */
  skipBuild?: boolean
  /** @en Skip git synchronization check. @zh 跳过 Git 同步检查。 */
  skipSync?: boolean
}
