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

export function App() {
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
        throw new Error('No target version available for draft prune.')
      }
      if (!dryRun) {
        if (lastDryRunTarget !== target) {
          throw new Error(
            'Please run "Prune Dry Run" first for the current target version.',
          )
        }
        const confirmed = window.confirm(
          `Confirm prune of behind drafts for ${target}?\n` +
            `Last dry-run reported ${lastDryRunAffectedCount} affected file(s).`,
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
        throw new Error('Select a compare branch first.')
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
        throw new Error('Run comparison first before saving snapshot.')
      }
      const saved = await saveSnapshot({
        id: snapshotNameInput || undefined,
        baseBranch: branchInput || context?.currentBranch || 'current',
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
        throw new Error('Select a snapshot first.')
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
        throw new Error('Select a snapshot first.')
      }
      const confirmed = window.confirm(
        `Delete snapshot "${selectedSnapshotId}"? This cannot be undone.`,
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
          <img src="/logo.svg" alt="NXSPUB logo" />
          <span>NXSPUB PREVIEW</span>
        </div>
        <div className="meta">
          {context
            ? `${context.mode.toUpperCase()} | ${context.packageManager.toUpperCase()} | ${context.currentBranch}`
            : 'Loading context...'}
        </div>
      </header>

      <section className="neo-border neo-shadow panel">
        <h2>Controls</h2>
        <div className="meta" style={{ marginBottom: 8 }}>
          CWD: {context?.cwd || '-'}
        </div>
        <div className="controls">
          <select
            value={branchInput}
            onChange={event => setBranchInput(event.target.value)}
          >
            <option value="">Current Branch</option>
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
            Refresh
          </button>
          <button
            type="button"
            className="neo-pressable"
            onClick={() => void loadChecksOnly()}
          >
            Run Checks
          </button>
          <button
            type="button"
            className="neo-pressable"
            onClick={() => void loadDraftHealth()}
          >
            Draft Health
          </button>
          <button
            type="button"
            className="neo-pressable"
            onClick={() => void exportLatestPreview()}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="neo-pressable"
            onClick={() => void exportDiagnosticBundleJson()}
          >
            Bundle JSON
          </button>
          <button
            type="button"
            className="neo-pressable"
            onClick={() => void exportDiagnosticBundleZip()}
          >
            Bundle ZIP
          </button>
          <select
            value={compareBranch}
            onChange={event => setCompareBranch(event.target.value)}
          >
            <option value="">Compare Branch</option>
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
            Compare
          </button>
          <input
            placeholder="snapshot id (optional)"
            value={snapshotNameInput}
            onChange={event => setSnapshotNameInput(event.target.value)}
          />
          <button
            type="button"
            className="neo-pressable"
            onClick={() => void saveCurrentSnapshot()}
          >
            Save Snapshot
          </button>
          <select
            value={selectedSnapshotId}
            onChange={event => setSelectedSnapshotId(event.target.value)}
          >
            <option value="">Load Snapshot</option>
            {filteredSnapshots.map(snapshot => (
              <option key={snapshot.id} value={snapshot.id}>
                {snapshot.id} ({snapshot.baseBranch}
                {snapshot.compareBranch ? ` -> ${snapshot.compareBranch}` : ''})
              </option>
            ))}
          </select>
          <input
            placeholder="snapshot keyword filter"
            value={snapshotFilterKeyword}
            onChange={event => setSnapshotFilterKeyword(event.target.value)}
          />
          <select
            value={snapshotFilterBranch}
            onChange={event => setSnapshotFilterBranch(event.target.value)}
          >
            <option value="">Snapshot Branch Filter</option>
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
            Load Snapshot
          </button>
          <button
            type="button"
            className="neo-pressable"
            onClick={() => void deleteSelectedSnapshot()}
          >
            Delete Snapshot
          </button>
        </div>
        {loading ? <div className="meta">Running...</div> : null}
        {liveEvent ? (
          <div className="meta">
            LIVE: {liveEvent.kind} / {liveEvent.phase} / {liveEvent.message}
          </div>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
      </section>

      <SummaryCards preview={preview} riskCount={riskCount} />

      <section className="neo-border neo-shadow panel">
        <h2>Version Plan</h2>
        <VersionPlanTable preview={preview} />
      </section>

      <section className="neo-border neo-shadow panel">
        <h2>Result Comparison</h2>
        <ComparisonPanel
          baseLabel={branchInput || context?.currentBranch || 'current'}
          compareLabel={compareBranch || 'compare'}
          basePreview={compareBasePreview}
          comparePreview={compareTargetPreview}
        />
      </section>

      <section className="neo-border neo-shadow panel">
        <h2>Dependency Propagation</h2>
        <DependencyPropagationPanel preview={preview} />
      </section>

      <section className="stack">
        <article className="neo-border neo-shadow panel">
          <h2>Pre-release Checks</h2>
          {checks?.items?.length ? (
            checks.items.map(item => (
              <div className={`check ${item.level}`} key={item.id}>
                <strong>{item.title}</strong>
                <div>{item.message}</div>
              </div>
            ))
          ) : (
            <div className="meta">No check results yet.</div>
          )}
          {checks ? (
            <div className="meta-grid">
              <div>
                GIT SYNC: {checks.gitSync.ok ? 'OK' : 'RISK'} | ahead=
                {checks.gitSync.ahead} behind={checks.gitSync.behind} dirty=
                {String(checks.gitSync.dirty)}
              </div>
              <div>TAG CONFLICTS: {checks.tagConflicts.length}</div>
              <div>REGISTRY CONFLICTS: {checks.registryConflicts.length}</div>
            </div>
          ) : null}
        </article>

        <article className="neo-border neo-shadow panel">
          <h2>Changelog Preview</h2>
          <ChangelogPreview preview={preview} />
        </article>

        <article className="neo-border neo-shadow panel">
          <h2>Draft Health</h2>
          <div className="controls" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="neo-pressable"
              onClick={() => void runDraftPrune(true)}
            >
              Prune Dry Run
            </button>
            <button
              type="button"
              className="neo-pressable"
              disabled={!canExecutePrune}
              onClick={() => void runDraftPrune(false)}
            >
              Prune Behind Drafts
            </button>
          </div>
          <div className="meta">
            {canExecutePrune
              ? `Ready to prune ${currentPruneTarget}. Last dry-run affected ${lastDryRunAffectedCount} file(s).`
              : 'Execute prune requires a dry-run for the same target version.'}
          </div>
          <DraftHealthPanel draftHealth={draftHealth} />
          {pruneResult ? (
            <div className="meta-grid" style={{ marginTop: 10 }}>
              <div>PRUNED: {pruneResult.prunedCount}</div>
              <div>REMAINING: {pruneResult.remaining}</div>
              <div>AFFECTED FILES: {pruneResult.affectedFiles.length}</div>
              <pre style={{ marginTop: 6 }}>
                {pruneResult.affectedFiles.slice(0, 20).join('\n') || '-'}
              </pre>
            </div>
          ) : null}
        </article>
      </section>
    </div>
  )
}
