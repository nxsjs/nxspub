import type {
  ApiError,
  ApiSuccess,
  DraftPruneResult,
  ExecutionStatusPayload,
  PreviewDiagnosticBundle,
  PreviewChecksReport,
  PreviewContext,
  PreviewDraftHealth,
  PreviewResult,
  PreviewSseEvent,
  PreviewSnapshotPayload,
  PreviewSnapshotSummary,
  ReleaseRunResult,
  VersionRunResult,
} from './types'

function getSessionToken(): string {
  const tokenMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="nxspub-console-token"]',
  )
  return tokenMeta?.content || ''
}

const SESSION_TOKEN = getSessionToken()
export function getSessionTokenValue(): string {
  return SESSION_TOKEN
}

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiSuccess<T>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-nxspub-console-token': SESSION_TOKEN,
      ...(init?.headers || {}),
    },
  })

  const data = (await response.json()) as ApiSuccess<T> | ApiError
  if (!response.ok || !data.ok) {
    const message =
      'error' in data
        ? data.error.message
        : `Request failed with ${response.status}`
    throw new Error(message)
  }

  return data
}

export async function fetchContext(): Promise<PreviewContext> {
  const result = await request<PreviewContext>('/api/context')
  return result.data
}

export async function fetchPreview(params: {
  branch?: string
  includeChangelog?: boolean
  includeChecks?: boolean
  signal?: AbortSignal
}): Promise<PreviewResult> {
  const { signal, ...body } = params
  const result = await request<PreviewResult>('/api/preview', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  })
  return result.data
}

export async function fetchChecks(
  branch?: string,
  signal?: AbortSignal,
): Promise<PreviewChecksReport> {
  const result = await request<PreviewChecksReport>('/api/checks', {
    method: 'POST',
    body: JSON.stringify({ branch }),
    signal,
  })
  return result.data
}

export async function fetchDraftHealth(
  target?: string,
): Promise<PreviewDraftHealth> {
  const query = target ? `?target=${encodeURIComponent(target)}` : ''
  const result = await request<PreviewDraftHealth>(`/api/drafts${query}`)
  return result.data
}

export async function fetchExportJson(): Promise<PreviewResult> {
  const result = await request<PreviewResult>('/api/export.json')
  return result.data
}

export async function pruneDrafts(
  target: string,
  dryRun: boolean,
): Promise<DraftPruneResult> {
  const result = await request<DraftPruneResult>('/api/drafts/prune', {
    method: 'POST',
    body: JSON.stringify({
      target,
      only: 'behind',
      dryRun,
    }),
  })
  return result.data
}

export async function fetchDiagnosticBundleJson(): Promise<PreviewDiagnosticBundle> {
  const result = await request<PreviewDiagnosticBundle>(
    '/api/export.bundle?format=json',
  )
  return result.data
}

export async function fetchDiagnosticBundleZip(): Promise<Blob> {
  const response = await fetch('/api/export.bundle?format=zip', {
    method: 'GET',
    headers: {
      'x-nxspub-console-token': SESSION_TOKEN,
    },
  })
  if (!response.ok) {
    let message = `Request failed with ${response.status}`
    try {
      const payload = (await response.json()) as ApiError
      if ('error' in payload) {
        message = payload.error.message
      }
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return await response.blob()
}

export async function fetchExecutionStatus(): Promise<ExecutionStatusPayload> {
  const result = await request<ExecutionStatusPayload>('/api/execution/status')
  return result.data
}

export async function runVersionCommand(params: {
  dry: boolean
  branch?: string
}): Promise<VersionRunResult> {
  const result = await request<VersionRunResult>('/api/version/run', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return result.data
}

export async function runReleaseCommand(params: {
  dry: boolean
  branch?: string
  registry?: string
  tag?: string
  access?: string
  provenance?: boolean
  skipBuild?: boolean
  skipSync?: boolean
}): Promise<ReleaseRunResult> {
  const result = await request<ReleaseRunResult>('/api/release/run', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  return result.data
}

export async function saveSnapshot(payload: {
  id?: string
  baseBranch: string
  compareBranch?: string
  basePreview: PreviewResult
  comparePreview: PreviewResult
}): Promise<{ id: string; createdAt: string }> {
  const result = await request<{ id: string; createdAt: string }>(
    '/api/snapshots',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
  return result.data
}

export async function listSnapshots(): Promise<PreviewSnapshotSummary[]> {
  const result = await request<{ snapshots: PreviewSnapshotSummary[] }>(
    '/api/snapshots',
  )
  return result.data.snapshots
}

export async function loadSnapshot(
  snapshotId: string,
): Promise<PreviewSnapshotPayload> {
  const result = await request<PreviewSnapshotPayload>(
    `/api/snapshots/${encodeURIComponent(snapshotId)}`,
  )
  return result.data
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  await request<{ id: string; deleted: boolean }>(
    `/api/snapshots/${encodeURIComponent(snapshotId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function createPreviewEventSource(): EventSource {
  const params = new URLSearchParams({
    token: SESSION_TOKEN,
  })
  return new EventSource(`/api/events?${params.toString()}`)
}

export function parsePreviewSseEvent(
  raw: MessageEvent<string>,
): PreviewSseEvent | null {
  try {
    return JSON.parse(raw.data) as PreviewSseEvent
  } catch {
    return null
  }
}
