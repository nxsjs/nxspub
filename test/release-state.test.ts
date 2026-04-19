import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  chooseStableBaselineVersion,
  loadReleaseState,
  updateStableBranchState,
} from '../src/utils/release-state'

describe('release state', () => {
  it('chooses stable baseline when current version is prerelease', () => {
    expect(chooseStableBaselineVersion('1.3.0-alpha.3', '1.2.3')).toBe('1.2.3')
  })

  it('chooses higher stable baseline when current version is behind', () => {
    expect(chooseStableBaselineVersion('1.2.0', '1.3.0')).toBe('1.3.0')
  })

  it('keeps current version when it is already ahead', () => {
    expect(chooseStableBaselineVersion('1.4.0', '1.3.0')).toBe('1.4.0')
  })

  it('persists and loads stable branch state', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nxspub-state-'))
    await updateStableBranchState(tempDir, 'main', {
      rootVersion: '1.3.0',
      packageVersions: {
        '@scope/a': '1.3.0',
      },
    })

    const state = await loadReleaseState(tempDir)
    expect(state.branches?.main?.rootVersion).toBe('1.3.0')
    expect(state.branches?.main?.packageVersions?.['@scope/a']).toBe('1.3.0')
  })
})
