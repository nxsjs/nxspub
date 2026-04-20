import type { PreviewResult } from '../types'

interface SummaryCardsProps {
  preview: PreviewResult | null
  riskCount: number
}

export function SummaryCards({ preview, riskCount }: SummaryCardsProps) {
  return (
    <section className="summary-grid">
      <article className="neo-border neo-shadow card">
        <h3>Current Version</h3>
        <p>{preview?.currentVersion || '-'}</p>
      </article>
      <article className="neo-border neo-shadow card">
        <h3>Target Version</h3>
        <p>{preview?.targetVersion || '-'}</p>
      </article>
      <article className="neo-border neo-shadow card">
        <h3>Commits</h3>
        <p>{preview?.commitCount ?? 0}</p>
      </article>
      <article className="neo-border neo-shadow card">
        <h3>Release Packages</h3>
        <p>{preview?.releasePackageCount ?? 0}</p>
      </article>
      <article className="neo-border neo-shadow card">
        <h3>Risks</h3>
        <p>{riskCount}</p>
      </article>
    </section>
  )
}
