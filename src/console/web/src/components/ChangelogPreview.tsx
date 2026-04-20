import type { PreviewResult } from '../types'
import type { Translator } from '../i18n'

interface ChangelogPreviewProps {
  preview: PreviewResult | null
  t: Translator
}

export function ChangelogPreview({ preview, t }: ChangelogPreviewProps) {
  return (
    <>
      <pre>{preview?.changelog?.entryPreview || t('noChangelogPreview')}</pre>
      {preview?.changelog?.importedDrafts?.length ? (
        <div className="meta-grid" style={{ marginTop: 10 }}>
          <div>{t('importedDrafts')}:</div>
          {preview.changelog.importedDrafts.map(item => (
            <div key={`${item.branch}-${item.version}`}>
              {item.branch}@{item.version} ({item.count})
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
