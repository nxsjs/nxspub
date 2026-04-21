import { useEffect, useRef, useState } from 'react'
import {
  createPreviewEventSource,
  deleteSnapshot as deleteSnapshotApi,
  fetchExecutionStatus,
  fetchChecks,
  fetchContext,
  fetchDiagnosticBundleJson,
  fetchDiagnosticBundleZip,
  listSnapshots,
  loadSnapshot,
  fetchDraftHealth,
  fetchExportJson,
  fetchPreview,
  pruneDrafts,
  parsePreviewSseEvent,
  runReleaseCommand,
  runVersionCommand,
  saveSnapshot,
} from './api'
import { ChangelogPreview } from './components/ChangelogPreview'
import { ComparisonPanel } from './components/ComparisonPanel'
import { DependencyPropagationPanel } from './components/DependencyPropagationPanel'
import { DraftHealthPanel } from './components/DraftHealthPanel'
import { SummaryCards } from './components/SummaryCards'
import { VersionPlanTable } from './components/VersionPlanTable'
import { createTranslator } from './i18n'
import type { PreviewLocale, Translator } from './i18n'
import type {
  DraftPruneResult,
  ExecutionLogItem,
  ExecutionStatusPayload,
  PreviewChecksReport,
  PreviewContext,
  PreviewDraftHealth,
  PreviewResult,
  ReleaseRunResult,
  PreviewSseEvent,
  PreviewSnapshotSummary,
  VersionRunResult,
} from './types'

function exportAsJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

interface AppProps {
  locale: PreviewLocale
}

type TimelineStepState = 'pending' | 'running' | 'success' | 'error'

type ViewMode =
  | 'overview'
  | 'comparison'
  | 'drafts'
  | 'dependencies'
  | 'diagnostics'
  | 'execution'

export function App({ locale }: AppProps) {
  const t: Translator = createTranslator(locale)
  const [activeView, setActiveView] = useState<ViewMode>('overview')
  const [branchInput, setBranchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [context, setContext] = useState<PreviewContext | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [checks, setChecks] = useState<PreviewChecksReport | null>(null)
  const [draftHealth, setDraftHealth] = useState<PreviewDraftHealth | null>(
    null,
  )
  const [compareBranch, setCompareBranch] = useState('')
  const [compareBasePreview, setCompareBasePreview] =
    useState<PreviewResult | null>(null)
  const [compareTargetPreview, setCompareTargetPreview] =
    useState<PreviewResult | null>(null)
  const [snapshotNameInput, setSnapshotNameInput] = useState('')
  const [savedSnapshots, setSavedSnapshots] = useState<
    PreviewSnapshotSummary[]
  >([])
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('')
  const [snapshotFilterKeyword, setSnapshotFilterKeyword] = useState('')
  const [snapshotFilterBranch, setSnapshotFilterBranch] = useState('')
  const [liveEvent, setLiveEvent] = useState<PreviewSseEvent | null>(null)
  const [pruneResult, setPruneResult] = useState<DraftPruneResult | null>(null)
  const [lastDryRunTarget, setLastDryRunTarget] = useState<string | null>(null)
  const [lastDryRunAffectedCount, setLastDryRunAffectedCount] = useState(0)
  const [executionStatus, setExecutionStatus] =
    useState<ExecutionStatusPayload | null>(null)
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogItem[]>([])
  const [lastVersionResult, setLastVersionResult] =
    useState<VersionRunResult | null>(null)
  const [lastReleaseResult, setLastReleaseResult] =
    useState<ReleaseRunResult | null>(null)
  const [releaseRegistry, setReleaseRegistry] = useState('')
  const [releaseTag, setReleaseTag] = useState('')
  const [releaseAccess, setReleaseAccess] = useState('')
  const [releaseProvenance, setReleaseProvenance] = useState(false)
  const [releaseSkipBuild, setReleaseSkipBuild] = useState(false)
  const [releaseSkipSync, setReleaseSkipSync] = useState(false)
  const previewAbortRef = useRef<AbortController | null>(null)
  const requestSerialRef = useRef(0)
  const currentPruneTarget = preview?.targetVersion?.split('-')[0] || null
  const canExecutePrune =
    !!currentPruneTarget && lastDryRunTarget === currentPruneTarget
  const riskCount = checks?.items.filter(item => !item.ok).length ?? 0
  const filteredSnapshots = savedSnapshots.filter(snapshot => {
    const keyword = snapshotFilterKeyword.trim().toLowerCase()
    const hitKeyword =
      keyword.length === 0 ||
      snapshot.id.toLowerCase().includes(keyword) ||
      snapshot.baseBranch.toLowerCase().includes(keyword) ||
      (snapshot.compareBranch || '').toLowerCase().includes(keyword)
    const hitBranch =
      snapshotFilterBranch.length === 0 ||
      snapshot.baseBranch === snapshotFilterBranch ||
      snapshot.compareBranch === snapshotFilterBranch
    return hitKeyword && hitBranch
  })

  function toLocalTimestamp(timestamp: string): string {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return timestamp
    return date.toLocaleString()
  }

  function stepStateLabel(state: TimelineStepState): string {
    if (state === 'running') return t('stepRunning')
    if (state === 'success') return t('stepSuccess')
    if (state === 'error') return t('stepError')
    return t('stepPending')
  }

  function buildExecutionTimeline(): Array<{
    key: string
    label: string
    state: TimelineStepState
  }> {
    const isRunning = executionStatus?.running === true
    const hasVersionResult = lastVersionResult !== null
    const hasReleaseResult = lastReleaseResult !== null
    const latestResult = hasReleaseResult
      ? lastReleaseResult
      : lastVersionResult
    const hasResult = hasVersionResult || hasReleaseResult
    const failed = latestResult?.status === 'failed'
    const succeeded = latestResult?.status === 'success'

    return [
      {
        key: 'validate',
        label: t('timelineValidate'),
        state: isRunning || hasResult ? 'success' : 'pending',
      },
      {
        key: 'plan',
        label: t('timelinePlan'),
        state: isRunning || hasResult ? 'success' : 'pending',
      },
      {
        key: 'execute',
        label: t('timelineExecute'),
        state: isRunning
          ? 'running'
          : failed
            ? 'error'
            : succeeded
              ? 'success'
              : 'pending',
      },
      {
        key: 'finalize',
        label: t('timelineFinalize'),
        state: succeeded ? 'success' : 'pending',
      },
    ]
  }

  async function runPreview(branchOverride: string, showLoading = true) {
    const requestId = ++requestSerialRef.current
    previewAbortRef.current?.abort()
    const abortController = new AbortController()
    previewAbortRef.current = abortController

    if (showLoading) setLoading(true)
    setError('')
    try {
      const branch = branchOverride || undefined
      const [nextPreview, nextChecks] = await Promise.all([
        fetchPreview({
          branch,
          includeChangelog: true,
          signal: abortController.signal,
        }),
        fetchChecks(branch, abortController.signal),
      ])
      if (requestId !== requestSerialRef.current) return

      setPreview(nextPreview)
      setChecks(nextChecks)
      setDraftHealth(nextPreview.draftHealth || null)
    } catch (err) {
      if (isAbortError(err)) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (requestId === requestSerialRef.current && showLoading) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const nextContext = await fetchContext()
        const snapshots = await listSnapshots()
        if (!cancelled) {
          setContext(nextContext)
          setSavedSnapshots(snapshots)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      cancelled = true
      previewAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const source = createPreviewEventSource()
    source.onmessage = raw => {
      const event = parsePreviewSseEvent(raw)
      if (event) {
        setLiveEvent(event)
      }
    }
    source.onerror = () => {
      source.close()
    }
    return () => {
      source.close()
    }
  }, [])

  useEffect(() => {
    if (!context) return

    const timer = setTimeout(() => {
      void runPreview(branchInput, true)
    }, 300)

    return () => clearTimeout(timer)
  }, [context, branchInput])

  async function refreshPreview() {
    await runPreview(branchInput, true)
  }

  async function loadChecksOnly() {
    setLoading(true)
    setError('')
    try {
      const nextChecks = await fetchChecks(branchInput || undefined)
      setChecks(nextChecks)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadDraftHealth() {
    setLoading(true)
    setError('')
    try {
      const target = preview?.targetVersion?.split('-')[0]
      const draft = await fetchDraftHealth(target)
      setDraftHealth(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function runDraftPrune(dryRun: boolean) {
    setLoading(true)
    setError('')
    try {
      const target = preview?.targetVersion?.split('-')[0]
      if (!target) {
        throw new Error(t('errNoTargetForPrune'))
      }
      if (!dryRun) {
        if (lastDryRunTarget !== target) {
          throw new Error(t('errRunDryRunFirst'))
        }
        const confirmed = window.confirm(
          t('confirmPrune', {
            target,
            count: lastDryRunAffectedCount,
          }),
        )
        if (!confirmed) return
      }
      const result = await pruneDrafts(target, dryRun)
      setPruneResult(result)
      if (dryRun) {
        setLastDryRunTarget(target)
        setLastDryRunAffectedCount(result.affectedFiles.length)
      } else {
        setLastDryRunTarget(null)
        setLastDryRunAffectedCount(0)
      }
      const draft = await fetchDraftHealth(target)
      setDraftHealth(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function exportLatestPreview() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchExportJson()
      exportAsJson(data, 'nxspub-preview.json')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function runComparison() {
    setLoading(true)
    setError('')
    try {
      if (!compareBranch) {
        throw new Error(t('errSelectCompareBranch'))
      }
      const baseBranch = branchInput || context?.currentBranch || undefined
      const [baseResult, compareResult] = await Promise.all([
        fetchPreview({
          branch: baseBranch,
          includeChangelog: false,
        }),
        fetchPreview({
          branch: compareBranch,
          includeChangelog: false,
        }),
      ])
      setCompareBasePreview(baseResult)
      setCompareTargetPreview(compareResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function refreshSnapshots() {
    const snapshots = await listSnapshots()
    setSavedSnapshots(snapshots)
  }

  async function saveCurrentSnapshot() {
    setLoading(true)
    setError('')
    try {
      if (!compareBasePreview || !compareTargetPreview) {
        throw new Error(t('errRunComparisonFirst'))
      }
      const saved = await saveSnapshot({
        id: snapshotNameInput || undefined,
        baseBranch: branchInput || context?.currentBranch || t('current'),
        compareBranch: compareBranch || undefined,
        basePreview: compareBasePreview,
        comparePreview: compareTargetPreview,
      })
      setSelectedSnapshotId(saved.id)
      await refreshSnapshots()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadSelectedSnapshot() {
    setLoading(true)
    setError('')
    try {
      if (!selectedSnapshotId) {
        throw new Error(t('errSelectSnapshotFirst'))
      }
      const snapshot = await loadSnapshot(selectedSnapshotId)
      setCompareBasePreview(snapshot.basePreview)
      setCompareTargetPreview(snapshot.comparePreview)
      setCompareBranch(snapshot.compareBranch || '')
      setBranchInput(snapshot.baseBranch || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function deleteSelectedSnapshot() {
    setLoading(true)
    setError('')
    try {
      if (!selectedSnapshotId) {
        throw new Error(t('errSelectSnapshotFirst'))
      }
      const confirmed = window.confirm(
        t('confirmDeleteSnapshot', { id: selectedSnapshotId }),
      )
      if (!confirmed) return

      await deleteSnapshotApi(selectedSnapshotId)
      setSelectedSnapshotId('')
      await refreshSnapshots()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function exportDiagnosticBundleJson() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchDiagnosticBundleJson()
      exportAsJson(data, 'nxspub-diagnostic-bundle.json')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function exportDiagnosticBundleZip() {
    setLoading(true)
    setError('')
    try {
      const blob = await fetchDiagnosticBundleZip()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'nxspub-diagnostic-bundle.zip'
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function refreshExecutionStatus() {
    try {
      const next = await fetchExecutionStatus()
      setExecutionStatus(next)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }

  async function runVersionExecution(dry: boolean) {
    setLoading(true)
    setError('')
    try {
      const status = await refreshExecutionStatus()
      if (status?.running) {
        throw new Error(t('errExecutionBusy'))
      }
      if (!dry) {
        const confirmed = window.confirm(t('confirmVersionApply'))
        if (!confirmed) return
      }
      const result = await runVersionCommand({
        dry,
        branch: branchInput || undefined,
      })
      setLastVersionResult(result)
      setExecutionLogs(result.logs)
      await Promise.all([refreshExecutionStatus(), refreshPreview()])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function runReleaseExecution(dry: boolean) {
    setLoading(true)
    setError('')
    try {
      const status = await refreshExecutionStatus()
      if (status?.running) {
        throw new Error(t('errExecutionBusy'))
      }
      if (!dry) {
        const confirmed = window.confirm(t('confirmReleasePublish'))
        if (!confirmed) return
      }
      const result = await runReleaseCommand({
        dry,
        branch: branchInput || undefined,
        registry: releaseRegistry || undefined,
        tag: releaseTag || undefined,
        access: releaseAccess || undefined,
        provenance: releaseProvenance || undefined,
        skipBuild: releaseSkipBuild || undefined,
        skipSync: releaseSkipSync || undefined,
      })
      setLastReleaseResult(result)
      setExecutionLogs(result.logs)
      await refreshExecutionStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="neo-border neo-shadow topbar">
        <div className="brand">
          <img src="/logo.svg" alt={t('appTitleA11y')} />
          <span>{t('appTitle')}</span>
        </div>
        <div className="meta">
          {context
            ? `${context.mode.toUpperCase()} | ${context.packageManager.toUpperCase()} | ${context.currentBranch}`
            : t('loadingContext')}
        </div>
      </header>

      <section className="neo-border neo-shadow panel">
        <h2>{t('globalControls')}</h2>
        <div className="meta" style={{ marginBottom: 8 }}>
          {t('cwd')}: {context?.cwd || '-'}
        </div>
        <div className="controls">
          <select
            value={branchInput}
            onChange={event => setBranchInput(event.target.value)}
          >
            <option value="">{t('currentBranch')}</option>
            {(context?.availableBranches || []).map(branch => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="primary neo-pressable"
            onClick={() => void refreshPreview()}
          >
            {t('refresh')}
          </button>
          <button
            type="button"
            className="neo-pressable"
            onClick={() => void loadChecksOnly()}
          >
            {t('runChecks')}
          </button>
        </div>
        {loading ? <div className="meta">{t('running')}</div> : null}
        {liveEvent ? (
          <div className="meta">
            {t('livePrefix')}: {liveEvent.kind} / {liveEvent.phase} /{' '}
            {liveEvent.message}
          </div>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
      </section>

      <section className="neo-border neo-shadow panel">
        <div className="controls">
          <button
            type="button"
            className={`neo-pressable ${activeView === 'overview' ? 'primary' : ''}`}
            onClick={() => setActiveView('overview')}
          >
            {t('viewOverview')}
          </button>
          <button
            type="button"
            className={`neo-pressable ${activeView === 'comparison' ? 'primary' : ''}`}
            onClick={() => setActiveView('comparison')}
          >
            {t('viewComparison')}
          </button>
          <button
            type="button"
            className={`neo-pressable ${activeView === 'drafts' ? 'primary' : ''}`}
            onClick={() => setActiveView('drafts')}
          >
            {t('viewDrafts')}
          </button>
          <button
            type="button"
            className={`neo-pressable ${activeView === 'dependencies' ? 'primary' : ''}`}
            onClick={() => setActiveView('dependencies')}
          >
            {t('viewDependencies')}
          </button>
          <button
            type="button"
            className={`neo-pressable ${activeView === 'diagnostics' ? 'primary' : ''}`}
            onClick={() => setActiveView('diagnostics')}
          >
            {t('viewDiagnostics')}
          </button>
          <button
            type="button"
            className={`neo-pressable ${activeView === 'execution' ? 'primary' : ''}`}
            onClick={() => {
              setActiveView('execution')
              void refreshExecutionStatus()
            }}
          >
            {t('viewExecution')}
          </button>
        </div>
      </section>

      {activeView === 'overview' ? (
        <>
          <SummaryCards preview={preview} riskCount={riskCount} t={t} />
          <section className="neo-border neo-shadow panel">
            <h2>{t('versionPlan')}</h2>
            <VersionPlanTable preview={preview} t={t} />
          </section>
          <section className="stack">
            <article className="neo-border neo-shadow panel">
              <h2>{t('preReleaseChecks')}</h2>
              {checks?.items?.length ? (
                checks.items.map(item => (
                  <div className={`check ${item.level}`} key={item.id}>
                    <strong>{item.title}</strong>
                    <div>{item.message}</div>
                  </div>
                ))
              ) : (
                <div className="meta">{t('noCheckResultsYet')}</div>
              )}
              {checks ? (
                <div className="meta-grid">
                  <div>
                    {t('gitSync')}: {checks.gitSync.ok ? t('ok') : t('risk')} |
                    ahead=
                    {checks.gitSync.ahead} behind={checks.gitSync.behind} dirty=
                    {String(checks.gitSync.dirty)}
                  </div>
                  <div>
                    {t('tagConflicts')}: {checks.tagConflicts.length}
                  </div>
                  <div>
                    {t('registryConflicts')}: {checks.registryConflicts.length}
                  </div>
                </div>
              ) : null}
            </article>
            <article className="neo-border neo-shadow panel">
              <h2>{t('changelogPreview')}</h2>
              <div className="controls" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className="neo-pressable"
                  onClick={() => void exportLatestPreview()}
                >
                  {t('exportJson')}
                </button>
              </div>
              <ChangelogPreview preview={preview} t={t} />
            </article>
          </section>
        </>
      ) : null}

      {activeView === 'comparison' ? (
        <section className="stack">
          <article className="neo-border neo-shadow panel">
            <h2>{t('resultComparison')}</h2>
            <div className="controls" style={{ marginBottom: 10 }}>
              <select
                value={compareBranch}
                onChange={event => setCompareBranch(event.target.value)}
              >
                <option value="">{t('compareBranch')}</option>
                {(context?.availableBranches || []).map(branch => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="neo-pressable"
                onClick={() => void runComparison()}
              >
                {t('compare')}
              </button>
            </div>
            <ComparisonPanel
              baseLabel={branchInput || context?.currentBranch || t('current')}
              compareLabel={compareBranch || t('compareLabelDefault')}
              basePreview={compareBasePreview}
              comparePreview={compareTargetPreview}
              t={t}
            />
          </article>

          <article className="neo-border neo-shadow panel">
            <h2>{t('saveSnapshot')}</h2>
            <div className="controls">
              <input
                placeholder={t('snapshotIdOptional')}
                value={snapshotNameInput}
                onChange={event => setSnapshotNameInput(event.target.value)}
              />
              <button
                type="button"
                className="neo-pressable"
                onClick={() => void saveCurrentSnapshot()}
              >
                {t('saveSnapshot')}
              </button>
              <select
                value={selectedSnapshotId}
                onChange={event => setSelectedSnapshotId(event.target.value)}
              >
                <option value="">{t('loadSnapshot')}</option>
                {filteredSnapshots.map(snapshot => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {snapshot.id} ({snapshot.baseBranch}
                    {snapshot.compareBranch
                      ? ` -> ${snapshot.compareBranch}`
                      : ''}
                    )
                  </option>
                ))}
              </select>
              <input
                placeholder={t('snapshotKeywordFilter')}
                value={snapshotFilterKeyword}
                onChange={event => setSnapshotFilterKeyword(event.target.value)}
              />
              <select
                value={snapshotFilterBranch}
                onChange={event => setSnapshotFilterBranch(event.target.value)}
              >
                <option value="">{t('snapshotBranchFilter')}</option>
                {(context?.availableBranches || []).map(branch => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="neo-pressable"
                onClick={() => void loadSelectedSnapshot()}
              >
                {t('loadSnapshot')}
              </button>
              <button
                type="button"
                className="neo-pressable"
                onClick={() => void deleteSelectedSnapshot()}
              >
                {t('deleteSnapshot')}
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {activeView === 'drafts' ? (
        <section className="neo-border neo-shadow panel">
          <h2>{t('draftHealthPanel')}</h2>
          <div className="controls" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="neo-pressable"
              onClick={() => void loadDraftHealth()}
            >
              {t('draftHealth')}
            </button>
            <button
              type="button"
              className="neo-pressable"
              onClick={() => void runDraftPrune(true)}
            >
              {t('pruneDryRun')}
            </button>
            <button
              type="button"
              className="neo-pressable"
              disabled={!canExecutePrune}
              onClick={() => void runDraftPrune(false)}
            >
              {t('pruneBehindDrafts')}
            </button>
          </div>
          <div className="meta">
            {canExecutePrune
              ? t('readyToPrune', {
                  target: currentPruneTarget || '-',
                  count: lastDryRunAffectedCount,
                })
              : t('requireDryRun')}
          </div>
          <DraftHealthPanel draftHealth={draftHealth} t={t} />
          {pruneResult ? (
            <div className="meta-grid" style={{ marginTop: 10 }}>
              <div>
                {t('pruned')}: {pruneResult.prunedCount}
              </div>
              <div>
                {t('remaining')}: {pruneResult.remaining}
              </div>
              <div>
                {t('affectedFiles')}: {pruneResult.affectedFiles.length}
              </div>
              <pre style={{ marginTop: 6 }}>
                {pruneResult.affectedFiles.slice(0, 20).join('\n') || '-'}
              </pre>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeView === 'dependencies' ? (
        <section className="neo-border neo-shadow panel">
          <h2>{t('dependencyPropagation')}</h2>
          <DependencyPropagationPanel preview={preview} t={t} />
        </section>
      ) : null}

      {activeView === 'diagnostics' ? (
        <section className="neo-border neo-shadow panel">
          <h2>{t('viewDiagnostics')}</h2>
          <div className="controls">
            <button
              type="button"
              className="neo-pressable"
              onClick={() => void exportLatestPreview()}
            >
              {t('exportJson')}
            </button>
            <button
              type="button"
              className="neo-pressable"
              onClick={() => void exportDiagnosticBundleJson()}
            >
              {t('bundleJson')}
            </button>
            <button
              type="button"
              className="neo-pressable"
              onClick={() => void exportDiagnosticBundleZip()}
            >
              {t('bundleZip')}
            </button>
          </div>
        </section>
      ) : null}

      {activeView === 'execution' ? (
        <section className="stack">
          <article className="neo-border neo-shadow panel">
            <h2>{t('executionWorkspace')}</h2>
            <div className="controls">
              <button
                type="button"
                className="neo-pressable"
                onClick={() => void refreshExecutionStatus()}
              >
                {t('refreshStatus')}
              </button>
            </div>
            <div className="meta-grid" style={{ marginTop: 10 }}>
              <div>
                {t('executionStatus')}:{' '}
                {executionStatus?.running ? t('running') : t('idle')}
              </div>
              {executionStatus?.currentTask ? (
                <>
                  <div>
                    {t('inFlightTask')}: {executionStatus.currentTask.kind}
                  </div>
                  <div>
                    {t('startedAt')}: {executionStatus.currentTask.startedAt}
                  </div>
                  <div>
                    {t('requestId')}: {executionStatus.currentTask.requestId}
                  </div>
                </>
              ) : null}
            </div>
          </article>

          <article className="neo-border neo-shadow panel">
            <h2>{t('versionRunner')}</h2>
            <div className="controls">
              <button
                type="button"
                className="neo-pressable"
                onClick={() => void runVersionExecution(true)}
              >
                {t('runVersionDry')}
              </button>
              <button
                type="button"
                className="neo-pressable"
                onClick={() => void runVersionExecution(false)}
              >
                {t('runVersionApply')}
              </button>
            </div>
            {lastVersionResult ? (
              <div className="execution-grid" style={{ marginTop: 10 }}>
                <div className="execution-kv">
                  <strong>{t('status')}</strong>
                  <span>{lastVersionResult.status}</span>
                </div>
                <div className="execution-kv">
                  <strong>{t('dryRun')}</strong>
                  <span>{String(lastVersionResult.dry)}</span>
                </div>
                <div className="execution-kv">
                  <strong>{t('mode')}</strong>
                  <span>{lastVersionResult.summary.mode}</span>
                </div>
                <div className="execution-kv">
                  <strong>{t('targetVersion')}</strong>
                  <span>{lastVersionResult.summary.targetVersion || '-'}</span>
                </div>
                <div className="execution-kv">
                  <strong>{t('releasePackages')}</strong>
                  <span>{lastVersionResult.summary.releasePackageCount}</span>
                </div>
              </div>
            ) : null}
          </article>

          <article className="neo-border neo-shadow panel">
            <h2>{t('releaseRunner')}</h2>
            <div className="controls">
              <input
                placeholder={t('releaseRegistry')}
                value={releaseRegistry}
                onChange={event => setReleaseRegistry(event.target.value)}
              />
              <input
                placeholder={t('releaseTag')}
                value={releaseTag}
                onChange={event => setReleaseTag(event.target.value)}
              />
              <input
                placeholder={t('releaseAccess')}
                value={releaseAccess}
                onChange={event => setReleaseAccess(event.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={releaseProvenance}
                  onChange={event => setReleaseProvenance(event.target.checked)}
                />
                {t('releaseProvenance')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={releaseSkipBuild}
                  onChange={event => setReleaseSkipBuild(event.target.checked)}
                />
                {t('skipBuild')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={releaseSkipSync}
                  onChange={event => setReleaseSkipSync(event.target.checked)}
                />
                {t('skipSync')}
              </label>
            </div>
            <div className="controls" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="neo-pressable"
                onClick={() => void runReleaseExecution(true)}
              >
                {t('runReleaseDry')}
              </button>
              <button
                type="button"
                className="neo-pressable"
                onClick={() => void runReleaseExecution(false)}
              >
                {t('runReleasePublish')}
              </button>
            </div>
            {lastReleaseResult ? (
              <div className="execution-grid" style={{ marginTop: 10 }}>
                <div className="execution-kv">
                  <strong>{t('status')}</strong>
                  <span>{lastReleaseResult.status}</span>
                </div>
                <div className="execution-kv">
                  <strong>{t('dryRun')}</strong>
                  <span>{String(lastReleaseResult.dry)}</span>
                </div>
                <div className="execution-kv">
                  <strong>{t('published')}</strong>
                  <span>{lastReleaseResult.published.length}</span>
                </div>
                <div className="execution-kv">
                  <strong>{t('skipped')}</strong>
                  <span>{lastReleaseResult.skipped.length}</span>
                </div>
              </div>
            ) : null}
          </article>

          <article className="neo-border neo-shadow panel">
            <h2>{t('executionTimeline')}</h2>
            <div className="timeline-list">
              {buildExecutionTimeline().map(step => (
                <div key={step.key} className={`timeline-item ${step.state}`}>
                  <strong>{step.label}</strong>
                  <span>{stepStateLabel(step.state)}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="neo-border neo-shadow panel">
            <h2>{t('executionLogs')}</h2>
            {executionLogs.length ? (
              <div className="timeline-list">
                {executionLogs.map((item, index) => (
                  <div key={`${item.at}-${index}`} className="log-item">
                    <strong className={`log-level ${item.level}`}>
                      {item.level.toUpperCase()}
                    </strong>
                    <span>{item.message}</span>
                    <span className="meta">{toLocalTimestamp(item.at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="meta">{t('noExecutionLogs')}</div>
            )}
          </article>
        </section>
      ) : null}
    </div>
  )
}
