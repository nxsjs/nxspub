import type { PreviewResult } from '../types'
import type { Translator } from '../i18n'

interface VersionPlanTableProps {
  preview: PreviewResult | null
  t: Translator
}

export function VersionPlanTable({ preview, t }: VersionPlanTableProps) {
  if (!preview) {
    return <div className="meta">{t('noPreviewResultYet')}</div>
  }

  if (preview.mode === 'single') {
    return (
      <div className="meta-grid">
        <div>
          {t('bumpType')}: {preview.singlePlan?.bumpType || '-'}
        </div>
        <div>
          {t('triggerCommits')}: {preview.singlePlan?.commits.length || 0}
        </div>
        <pre style={{ marginTop: 8 }}>
          {(preview.singlePlan?.commits || [])
            .map(commit => `${commit.hash.slice(0, 7)} ${commit.subject}`)
            .join('\n') || '-'}
        </pre>
      </div>
    )
  }

  if (!preview.packages?.length) {
    return <div className="meta">{t('noWorkspaceRows')}</div>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>{t('tableName')}</th>
          <th>{t('tableCurrent')}</th>
          <th>{t('tableNext')}</th>
          <th>{t('tableBump')}</th>
          <th>{t('tablePassive')}</th>
          <th>{t('tableReasons')}</th>
        </tr>
      </thead>
      <tbody>
        {preview.packages.map(item => (
          <tr key={item.name}>
            <td>{item.name}</td>
            <td>{item.currentVersion}</td>
            <td>{item.nextVersion || '-'}</td>
            <td>{item.bumpType || '-'}</td>
            <td>{item.isPassive ? t('yes') : t('no')}</td>
            <td>{item.passiveReasons?.join(', ') || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
