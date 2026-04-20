import { useEffect, useRef, useState } from 'react'
import {
  createPreviewEventSource,
  deleteSnapshot as deleteSnapshotApi,
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
  PreviewChecksReport,
  PreviewContext,
  PreviewDraftHealth,
  PreviewResult,
  PreviewSseEvent,
  PreviewSnapshotSummary,
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

type ViewMode =
  | 'overview'
  | 'comparison'
  | 'drafts'
  | 'dependencies'
  | 'diagnostics'

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
    </div>
  )
}
