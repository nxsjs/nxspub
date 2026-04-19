import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { draftDoctorCommand } from '../src/commands/draft-doctor'
import {
  readChangelogDrafts,
  writeChangelogDraft,
} from '../src/utils/changelog'

describe('draft doctor', () => {
  it('prunes stale drafts behind target version when --prune is enabled', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'nxspub-draft-doctor-'),
    )
    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'demo', version: '1.3.0' }, null, 2),
      'utf-8',
    )

    await writeChangelogDraft(tempDir, {
      schemaVersion: 1,
      branch: 'alpha',
      version: '1.2.0-alpha.1',
      generatedAt: '2026-04-20T00:00:00.000Z',
      items: [{ label: 'Features', hash: 'aaaaaaa1', content: '* stale' }],
    })
    await writeChangelogDraft(tempDir, {
      schemaVersion: 1,
      branch: 'beta',
      version: '1.3.0-beta.1',
      generatedAt: '2026-04-20T00:00:00.000Z',
      items: [{ label: 'Features', hash: 'bbbbbbb2', content: '* keep' }],
    })

    await draftDoctorCommand({
      cwd: tempDir,
      target: '1.3.0',
      prune: true,
    })

    const drafts = await readChangelogDrafts(tempDir)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].draft.branch).toBe('beta')
    expect(drafts[0].draft.version).toBe('1.3.0-beta.1')
  })
})
