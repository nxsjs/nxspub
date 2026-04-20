import type { PreviewDraftHealth } from '../types'
import type { Translator } from '../i18n'

interface DraftHealthPanelProps {
  draftHealth: PreviewDraftHealth | null
  t: Translator
}

export function DraftHealthPanel({ draftHealth, t }: DraftHealthPanelProps) {
  if (!draftHealth) {
    return <div className="meta">{t('noDraftHealthLoaded')}</div>
  }

  return (
    <>
      <div className="meta-grid">
        <div>
          {t('target')}: {draftHealth.target}
        </div>
        <div>
          {t('matching')}: {draftHealth.matching}
        </div>
        <div>
          {t('behind')}: {draftHealth.behind}
        </div>
        <div>
          {t('ahead')}: {draftHealth.ahead}
        </div>
        <div>
          {t('invalid')}: {draftHealth.invalid}
        </div>
        <div>
          {t('malformed')}: {draftHealth.malformedFileCount}
        </div>
      </div>
      {draftHealth.behindSamples.length ? (
        <pre style={{ marginTop: 8 }}>
          {draftHealth.behindSamples.join('\n')}
        </pre>
      ) : null}
    </>
  )
}
