import type { PreviewResult } from '../types'
import type { Translator } from '../i18n'

interface DependencyPropagationPanelProps {
  preview: PreviewResult | null
  t: Translator
}

type GraphRow = {
  name: string
  dependencies: string[]
  isPassive: boolean
  passiveReasons: string[]
}

function buildGraphRows(preview: PreviewResult): GraphRow[] {
  const rows = preview.packages || []
  const names = new Set(rows.map(row => row.name))
  return rows.map(row => ({
    name: row.name,
    dependencies: (row.dependencies || []).filter(dep => names.has(dep)),
    isPassive: !!row.isPassive,
    passiveReasons: row.passiveReasons || [],
  }))
}

function computeLayerByDepth(rows: GraphRow[]): Map<string, number> {
  const layerMap = new Map<string, number>()
  const rowMap = new Map(rows.map(row => [row.name, row]))

  const visit = (name: string, visiting: Set<string>): number => {
    const existing = layerMap.get(name)
    if (typeof existing === 'number') return existing
    if (visiting.has(name)) return 0

    visiting.add(name)
    const row = rowMap.get(name)
    if (!row || row.dependencies.length === 0) {
      layerMap.set(name, 0)
      visiting.delete(name)
      return 0
    }

    const depth =
      Math.max(...row.dependencies.map(dep => visit(dep, visiting))) + 1
    layerMap.set(name, depth)
    visiting.delete(name)
    return depth
  }

  for (const row of rows) {
    visit(row.name, new Set<string>())
  }

  return layerMap
}

function renderLayeredTopology(rows: GraphRow[], t: Translator): string {
  const layerMap = computeLayerByDepth(rows)
  const maxDepth = Math.max(...Array.from(layerMap.values()), 0)
  const lines: string[] = []

  for (let layer = 0; layer <= maxDepth; layer++) {
    const layerRows = rows
      .filter(row => layerMap.get(row.name) === layer)
      .sort((a, b) => a.name.localeCompare(b.name))
    if (layerRows.length === 0) continue

    lines.push(`${t('layer')} ${layer}`)
    for (const row of layerRows) {
      const depsText =
        row.dependencies.length > 0
          ? row.dependencies.join(', ')
          : t('noInternalDeps')
      const passiveFlag = row.isPassive ? ` ${t('passiveTag')}` : ''
      lines.push(`  ${row.name}${passiveFlag} <= ${depsText}`)
      if (row.passiveReasons.length > 0) {
        lines.push(`    ${t('reason')}: ${row.passiveReasons.join(', ')}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

function renderPropagationEdges(rows: GraphRow[], t: Translator): string {
  const dependents = new Map<string, string[]>()
  for (const row of rows) {
    for (const dep of row.dependencies) {
      const list = dependents.get(dep) || []
      list.push(row.name)
      dependents.set(dep, list)
    }
  }

  const lines = Array.from(dependents.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([dep, list]) =>
        `${dep} => ${list.sort((a, b) => a.localeCompare(b)).join(', ')}`,
    )

  return lines.length > 0 ? lines.join('\n') : t('noPropagationEdges')
}

export function DependencyPropagationPanel({
  preview,
  t,
}: DependencyPropagationPanelProps) {
  if (!preview) {
    return <div className="meta">{t('noPreviewResultYet')}</div>
  }

  if (preview.mode !== 'workspace') {
    return <div className="meta">{t('workspaceOnlyDependency')}</div>
  }

  const rows = buildGraphRows(preview)
  if (rows.length === 0) {
    return <div className="meta">{t('noWorkspaceData')}</div>
  }

  return (
    <div className="meta-grid">
      <div>{t('layeredTopology')}</div>
      <pre style={{ marginTop: 8 }}>{renderLayeredTopology(rows, t)}</pre>
      <div>{t('propagationEdges')}</div>
      <pre style={{ marginTop: 8 }}>{renderPropagationEdges(rows, t)}</pre>
    </div>
  )
}
