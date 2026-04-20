import type { PreviewResult } from '../types'

interface ComparisonPanelProps {
  baseLabel: string
  compareLabel: string
  basePreview: PreviewResult | null
  comparePreview: PreviewResult | null
}

function renderWorkspaceDiff(base: PreviewResult, compare: PreviewResult) {
  const basePackages = new Map(
    (base.packages || []).map(item => [item.name, item]),
  )
  const comparePackages = new Map(
    (compare.packages || []).map(item => [item.name, item]),
  )
  const names = Array.from(
    new Set([...basePackages.keys(), ...comparePackages.keys()]),
  ).sort((a, b) => a.localeCompare(b))

  const rows = names
    .map(name => {
      const left = basePackages.get(name)
      const right = comparePackages.get(name)
      const leftNext = left?.nextVersion || '-'
      const rightNext = right?.nextVersion || '-'
      if (leftNext === rightNext) return null
      return `${name}: ${leftNext} -> ${rightNext}`
    })
    .filter(Boolean) as string[]

  return rows.length > 0 ? rows.join('\n') : 'No package-level differences.'
}

export function ComparisonPanel({
  baseLabel,
  compareLabel,
  basePreview,
  comparePreview,
}: ComparisonPanelProps) {
  if (!basePreview || !comparePreview) {
    return <div className="meta">No comparison result yet.</div>
  }

  const baseVersion = basePreview.targetVersion || '-'
  const compareVersion = comparePreview.targetVersion || '-'
  const baseReleaseCount = basePreview.releasePackageCount
  const compareReleaseCount = comparePreview.releasePackageCount

  return (
    <div className="meta-grid">
      <div>
        TARGET VERSION: {baseLabel}={baseVersion} | {compareLabel}=
        {compareVersion}
      </div>
      <div>
        RELEASE PACKAGES: {baseLabel}={baseReleaseCount} | {compareLabel}=
        {compareReleaseCount}
      </div>
      <pre style={{ marginTop: 8 }}>
        {basePreview.mode === 'workspace' && comparePreview.mode === 'workspace'
          ? renderWorkspaceDiff(basePreview, comparePreview)
          : `${baseLabel}: ${baseVersion}\n${compareLabel}: ${compareVersion}`}
      </pre>
    </div>
  )
}
