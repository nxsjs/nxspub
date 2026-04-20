import type { PreviewResult } from '../types'
import type { Translator } from '../i18n'

interface SummaryCardsProps {
  preview: PreviewResult | null
  riskCount: number
  t: Translator
}

export function SummaryCards({ preview, riskCount, t }: SummaryCardsProps) {
  return (
    <section className="summary-grid">
      <article className="neo-border neo-shadow card">
        <h3>{t('currentVersion')}</h3>
        <p>{preview?.currentVersion || '-'}</p>
      </article>
      <article className="neo-border neo-shadow card">
        <h3>{t('targetVersion')}</h3>
        <p>{preview?.targetVersion || '-'}</p>
      </article>
      <article className="neo-border neo-shadow card">
        <h3>{t('commits')}</h3>
        <p>{preview?.commitCount ?? 0}</p>
      </article>
      <article className="neo-border neo-shadow card">
        <h3>{t('releasePackages')}</h3>
        <p>{preview?.releasePackageCount ?? 0}</p>
      </article>
      <article className="neo-border neo-shadow card">
        <h3>{t('risks')}</h3>
        <p>{riskCount}</p>
      </article>
    </section>
  )
}
