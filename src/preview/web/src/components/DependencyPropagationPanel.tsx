import type { PreviewResult } from '../types'

interface DependencyPropagationPanelProps {
  preview: PreviewResult | null
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

function renderLayeredTopology(rows: GraphRow[]): string {
  const layerMap = computeLayerByDepth(rows)
  const maxDepth = Math.max(...Array.from(layerMap.values()), 0)
  const lines: string[] = []

  for (let layer = 0; layer <= maxDepth; layer++) {
    const layerRows = rows
      .filter(row => layerMap.get(row.name) === layer)
      .sort((a, b) => a.name.localeCompare(b.name))
    if (layerRows.length === 0) continue

    lines.push(`Layer ${layer}`)
    for (const row of layerRows) {
      const depsText =
        row.dependencies.length > 0
          ? row.dependencies.join(', ')
          : '(no internal deps)'
      const passiveFlag = row.isPassive ? ' [PASSIVE]' : ''
      lines.push(`  ${row.name}${passiveFlag} <= ${depsText}`)
      if (row.passiveReasons.length > 0) {
        lines.push(`    reason: ${row.passiveReasons.join(', ')}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

function renderPropagationEdges(rows: GraphRow[]): string {
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

  return lines.length > 0 ? lines.join('\n') : 'No propagation edges.'
}

export function DependencyPropagationPanel({
  preview,
}: DependencyPropagationPanelProps) {
  if (!preview) {
    return <div className="meta">No preview result yet.</div>
  }

  if (preview.mode !== 'workspace') {
    return (
      <div className="meta">
        Dependency propagation graph is available in workspace mode only.
      </div>
    )
  }

  const rows = buildGraphRows(preview)
  if (rows.length === 0) {
    return <div className="meta">No workspace package data.</div>
  }

  return (
    <div className="meta-grid">
      <div>LAYERED TOPOLOGY (package &lt;= internal dependencies)</div>
      <pre style={{ marginTop: 8 }}>{renderLayeredTopology(rows)}</pre>
      <div>PROPAGATION EDGES (dependency =&gt; dependents)</div>
      <pre style={{ marginTop: 8 }}>{renderPropagationEdges(rows)}</pre>
    </div>
  )
}
