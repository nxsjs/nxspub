export interface CwdOptions {
  cwd: string
}

export interface DryRunOptions extends CwdOptions {
  dry?: boolean
}

export interface GitHooksOptions extends DryRunOptions {}

export interface LintOptions extends CwdOptions {
  edit?: string
}

export interface VersionOptions extends DryRunOptions {}

export interface ReleaseOptions extends DryRunOptions {
  provenance?: boolean
  registry?: string
  access?: string
  tag?: string
  branch?: string
  skipBuild?: boolean
  skipSync?: boolean
}
