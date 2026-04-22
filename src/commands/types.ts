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
 * @en Command options for console command.
 * @zh console 命令参数。
 */
export interface ConsoleOptions extends CwdOptions {
  /** @en Enable web preview server mode. @zh 启用 Web 预览服务模式。 */
  web?: boolean
  /** @en Output preview result as JSON. @zh 以 JSON 输出预览结果。 */
  json?: boolean
  /** @en Simulate preview on the given branch. @zh 基于指定分支进行模拟预览。 */
  branch?: string
  /** @en Host to bind the web server. @zh Web 服务监听主机。 */
  host?: string
  /** @en Port to bind the web server. @zh Web 服务监听端口。 */
  port?: number
  /** @en Auto-open browser after server starts. @zh 服务启动后自动打开浏览器。 */
  open?: boolean
  /** @en Strict read-only mode for web APIs. @zh Web API 严格只读模式。 */
  readonlyStrict?: boolean
  /** @en Allow remote access when host is 0.0.0.0. @zh 当 host 为 0.0.0.0 时允许远程访问。 */
  allowRemote?: boolean
  /** @en Start only API service without serving web assets. @zh 仅启动 API 服务，不提供 Web 静态页面。 */
  apiOnly?: boolean
}

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

/**
 * @en Command options for deploy command.
 * @zh deploy 命令参数。
 */
export interface DeployOptions extends DryRunOptions {
  /** @en Target deploy environment. @zh 目标部署环境。 */
  env?: string
  /** @en Deploy strategy override. @zh 部署策略覆盖值。 */
  strategy?: 'rolling' | 'canary' | 'blue-green'
  /** @en Branch override for environment resolution. @zh 用于环境解析的分支覆盖值。 */
  branch?: string
  /** @en Run in plan-only mode. @zh 仅输出部署计划。 */
  plan?: boolean
  /** @en Enable rollback mode. @zh 启用回滚模式。 */
  rollback?: boolean
  /** @en Rollback target deployment id. @zh 回滚目标部署 ID。 */
  to?: string
  /** @en Skip non-critical checks. @zh 跳过非关键检查。 */
  skipChecks?: boolean
  /** @en Workspace deploy concurrency limit. @zh 工作区部署并发上限。 */
  concurrency?: number
  /** @en Output machine-readable JSON. @zh 输出机器可读 JSON。 */
  json?: boolean
}

/**
 * @en Command options for mcp command.
 * @zh mcp 命令参数。
 */
export interface McpOptions extends CwdOptions {
  /** @en MCP sub-action. @zh MCP 子动作。 */
  action?: string
  /** @en Initialize client config mode. @zh 初始化客户端配置模式。 */
  init?: boolean
  /** @en MCP client name (for init mode). @zh MCP 客户端名称（用于初始化模式）。 */
  client?: 'claude' | 'cursor' | 'vscode' | 'codex' | 'opencode'
}

/**
 * @en Command options for mcp init command.
 * @zh mcp init 命令参数。
 */
export interface McpInitOptions extends CwdOptions {
  /** @en MCP client name. @zh MCP 客户端名称。 */
  client?: 'claude' | 'cursor' | 'vscode' | 'codex' | 'opencode'
}
