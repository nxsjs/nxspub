export interface ApiSuccess<T> {
  ok: true
  apiVersion: string
  data: T
  requestId: string
  timestamp: string
}

export interface ApiError {
  ok: false
  apiVersion: string
  error: {
    code: string
    message: string
    details?: unknown
  }
  requestId: string
  timestamp: string
}

export interface PreviewPolicyStatus {
  branch: string
  policy: string | null
  ok: boolean
  message?: string
}

export interface PreviewPackagePlan {
  name: string
  private: boolean
  currentVersion: string
  nextVersion?: string
  bumpType?: string | null
  isPassive?: boolean
  passiveReasons?: string[]
  commitCount: number
  dependencies?: string[]
}

export interface PreviewCheckItem {
  id: string
  title: string
  message: string
  level: 'blocker' | 'warn' | 'info'
  ok: boolean
}

export interface PreviewChecksReport {
  policy: {
    ok: boolean
    message?: string
  }
  gitSync: {
    ok: boolean
    ahead: number
    behind: number
    dirty: boolean
  }
  tagConflicts: Array<{ tag: string; local: boolean; remote: boolean }>
  registryConflicts: Array<{ name: string; version: string }>
  items: PreviewCheckItem[]
}

export interface PreviewDraftHealth {
  target: string
  matching: number
  behind: number
  ahead: number
  invalid: number
  malformedFileCount: number
  behindSamples: string[]
}

export interface DraftPruneResult {
  prunedCount: number
  remaining: number
  affectedFiles: string[]
}

export interface PreviewDiagnosticBundle {
  meta: {
    generatedAt: string
    apiVersion: 'v1'
    nodeVersion: string
    cwd: string
  }
  context: PreviewContext
  preview: PreviewResult
  checks: PreviewChecksReport
  drafts: PreviewDraftHealth
}

export interface PreviewSnapshotSummary {
  id: string
  createdAt: string
  baseBranch: string
  compareBranch?: string
}

export interface PreviewSnapshotPayload {
  id: string
  createdAt: string
  baseBranch: string
  compareBranch?: string
  basePreview: PreviewResult
  comparePreview: PreviewResult
}

export interface PreviewSseEvent {
  kind: string
  phase: 'start' | 'success' | 'error' | 'info'
  message: string
  timestamp: string
}

export type ExecutionTaskKind = 'version' | 'release' | 'deploy' | 'rollback'

export interface ExecutionLogItem {
  level: 'info' | 'warn' | 'error'
  message: string
  at: string
}

export interface ExecutionStatusPayload {
  running: boolean
  currentTask?: {
    kind: ExecutionTaskKind
    startedAt: string
    requestId: string
  }
}

export interface VersionRunResult {
  status: 'success' | 'failed'
  dry: boolean
  summary: {
    mode: 'single' | 'workspace'
    targetVersion?: string
    releasePackageCount: number
  }
  logs: ExecutionLogItem[]
}

export interface ReleaseRunResult {
  status: 'success' | 'failed'
  dry: boolean
  published: Array<{ name: string; version: string }>
  skipped: Array<{ name: string; version: string; reason: string }>
  logs: ExecutionLogItem[]
}

export interface DeployPlanResult {
  env: string
  strategy: 'rolling' | 'canary' | 'blue-green'
  mode: 'single' | 'workspace'
  branch: string
  artifacts: Array<{
    name: string
    version: string
    tag?: string
    digest?: string
    image?: string
    source: 'release-session' | 'deploy-record' | 'registry' | 'manual'
  }>
  checks: Array<{
    id: string
    ok: boolean
    level: 'blocker' | 'warn' | 'info'
    message: string
  }>
}

export interface DeployRunResult {
  deploymentId: string
  status: 'success' | 'failed' | 'partial'
  deployed: Array<{ name: string; version: string }>
  skipped: Array<{ name: string; version: string; reason: string }>
  failed: Array<{ name: string; version: string; reason: string }>
  timeline: Array<{
    step: string
    status: 'pending' | 'running' | 'success' | 'error'
    at: string
    message?: string
  }>
}

export interface DeployRollbackResult {
  deploymentId: string
  rollbackTo: string
  status: 'success' | 'failed'
  timeline: Array<{
    step: string
    status: 'pending' | 'running' | 'success' | 'error'
    at: string
    message?: string
  }>
}

export interface DeployRecordSummary {
  deploymentId: string
  env: string
  strategy: string
  branch: string
  status: string
  finishedAt: string
  rollbackTo?: string
}

export interface DeployRecordDetail {
  deploymentId: string
  env: string
  strategy: 'rolling' | 'canary' | 'blue-green'
  branch: string
  status: 'success' | 'failed' | 'partial'
  startedAt: string
  finishedAt: string
  commitSha?: string
  artifacts: Array<{
    name: string
    version: string
    tag?: string
    digest?: string
    image?: string
    source: 'release-session' | 'deploy-record' | 'registry' | 'manual'
  }>
  timeline: Array<{
    step: string
    status: 'pending' | 'running' | 'success' | 'error'
    at: string
    message?: string
  }>
  rollbackTo?: string
  result: unknown
}

export interface PreviewResult {
  mode: 'single' | 'workspace'
  branch: string
  policy: PreviewPolicyStatus
  currentVersion?: string
  targetVersion?: string
  commitCount: number
  releasePackageCount: number
  singlePlan?: {
    bumpType?: string | null
    commits: Array<{ hash: string; subject: string }>
  }
  packages?: PreviewPackagePlan[]
  draftHealth?: PreviewDraftHealth
  changelog?: {
    entryPreview: string
    importedDrafts: Array<{ branch: string; version: string; count: number }>
  }
  checks?: PreviewCheckItem[]
}

export interface PreviewContext {
  cwd: string
  mode: 'single' | 'workspace'
  workspaceMode?: string
  packageManager: string
  currentBranch: string
  availableBranches: string[]
}
