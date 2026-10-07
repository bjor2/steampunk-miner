import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { blenderAssetIds, isValidPartId } from '../../../systems/art/artIds'
import { sidecarProblems, type PartsSidecar } from '../../../systems/art/partsSidecar'
import { dockAddOnArtAssetsOf } from './dockAddOnArt'
import {
  DOCK_ADD_ONS,
  MAX_DOCK_ADD_ON_PARTS,
  dockAddOnAssetIdOf,
  dockAddOnPartIdsOf,
} from './dockAddOns'

// The add-ons ship as three platform assets (#222): the slice registers each id and its moving
// part (#214), and the exported sidecar must hold exactly the shell and that part.

const REPO = new URL('../../../../', import.meta.url)

const artSlice: SliceDefinition = {
  id: 'dock-buildings',
  register: (r) => r.artAssets(dockAddOnArtAssetsOf(DOCK_ADD_ONS)),
}

function sidecarAt(path: string): PartsSidecar {
  return JSON.parse(readFileSync(new URL(path, REPO), 'utf8'))
}

const exportedSidecarOf = (id: string) => sidecarAt(`public/assets/platform/${id}/${id}.parts.json`)
const placeholderSidecarOf = (id: string) => sidecarAt(`art/placeholders/${id}.parts.json`)

describe('dock add-on art', () => {
  it('registers one platform asset per add-on with its moving part', () => {
    expect(dockAddOnArtAssetsOf(DOCK_ADD_ONS)).toEqual([
      { id: 'platform-scanner-station', category: 'platform', parts: ['scanner-dish'] },
      { id: 'platform-research-lab', category: 'platform', parts: ['lab-orrery'] },
      { id: 'platform-drone-bay', category: 'platform', parts: ['hangar-drone'] },
    ])
  })

  it('joins the Blender asset list, so the lint and the export accept the three ids', () => {
    withRegistrations([artSlice], () => {
      const ids = DOCK_ADD_ONS.map(dockAddOnAssetIdOf)
      expect(blenderAssetIds()).toEqual(expect.arrayContaining(ids))
      expect(isValidPartId('platform-drone-bay', 'hangar-drone')).toBe(true)
    })
  })

  it.each(DOCK_ADD_ONS.map((addOn) => [dockAddOnAssetIdOf(addOn), addOn] as const))(
    'ships %s with exactly its shell and moving part, valid under schema 1',
    (id, addOn) => {
      withRegistrations([artSlice], () => {
        for (const sidecar of [exportedSidecarOf(id), placeholderSidecarOf(id)]) {
          const partIds = sidecar.parts.map((part) => part.id)
          expect(partIds.sort()).toEqual(dockAddOnPartIdsOf(addOn).sort())
          expect(partIds.length).toBeLessThanOrEqual(MAX_DOCK_ADD_ON_PARTS)
          expect(sidecarProblems(id, sidecar)).toEqual([])
        }
      })
    },
  )
})
