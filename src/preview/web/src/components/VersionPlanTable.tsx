import type { PreviewResult } from '../types'

interface VersionPlanTableProps {
  preview: PreviewResult | null
}

export function VersionPlanTable({ preview }: VersionPlanTableProps) {
  if (!preview) {
    return <div className="meta">No preview result yet.</div>
  }

  if (preview.mode === 'single') {
    return (
      <div className="meta-grid">
        <div>BUMP TYPE: {preview.singlePlan?.bumpType || '-'}</div>
        <div>TRIGGER COMMITS: {preview.singlePlan?.commits.length || 0}</div>
        <pre style={{ marginTop: 8 }}>
          {(preview.singlePlan?.commits || [])
            .map(commit => `${commit.hash.slice(0, 7)} ${commit.subject}`)
            .join('\n') || '-'}
        </pre>
      </div>
    )
  }

  if (!preview.packages?.length) {
    return (
      <div className="meta">No workspace package rows in current preview.</div>
    )
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Current</th>
          <th>Next</th>
          <th>Bump</th>
          <th>Passive</th>
          <th>Reasons</th>
        </tr>
      </thead>
      <tbody>
        {preview.packages.map(item => (
          <tr key={item.name}>
            <td>{item.name}</td>
            <td>{item.currentVersion}</td>
            <td>{item.nextVersion || '-'}</td>
            <td>{item.bumpType || '-'}</td>
            <td>{item.isPassive ? 'YES' : 'NO'}</td>
            <td>{item.passiveReasons?.join(', ') || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
