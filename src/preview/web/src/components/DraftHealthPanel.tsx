import type { PreviewDraftHealth } from '../types'

interface DraftHealthPanelProps {
  draftHealth: PreviewDraftHealth | null
}

export function DraftHealthPanel({ draftHealth }: DraftHealthPanelProps) {
  if (!draftHealth) {
    return <div className="meta">No draft health loaded.</div>
  }

  return (
    <>
      <div className="meta-grid">
        <div>TARGET: {draftHealth.target}</div>
        <div>MATCHING: {draftHealth.matching}</div>
        <div>BEHIND: {draftHealth.behind}</div>
        <div>AHEAD: {draftHealth.ahead}</div>
        <div>INVALID: {draftHealth.invalid}</div>
        <div>MALFORMED: {draftHealth.malformedFileCount}</div>
      </div>
      {draftHealth.behindSamples.length ? (
        <pre style={{ marginTop: 8 }}>
          {draftHealth.behindSamples.join('\n')}
        </pre>
      ) : null}
    </>
  )
}
