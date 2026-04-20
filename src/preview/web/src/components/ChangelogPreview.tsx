import type { PreviewResult } from '../types'

interface ChangelogPreviewProps {
  preview: PreviewResult | null
}

export function ChangelogPreview({ preview }: ChangelogPreviewProps) {
  return (
    <>
      <pre>
        {preview?.changelog?.entryPreview || 'No changelog preview available.'}
      </pre>
      {preview?.changelog?.importedDrafts?.length ? (
        <div className="meta-grid" style={{ marginTop: 10 }}>
          <div>IMPORTED DRAFTS:</div>
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
