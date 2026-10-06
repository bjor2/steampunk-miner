import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { vehicleStagingOf } from '../../systems/registries/vehicleStaging'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { worldPiecesOf } from './worldPieces'

const Nothing = () => null

const twoPieces: SliceDefinition = {
  id: 'fake-pad',
  register(r) {
    r.worldPiece({ id: 'fake-pad.z-crane', layer: 'platform', Piece: Nothing })
    r.worldPiece({ id: 'fake-pad.a-shed', layer: 'platform', Piece: Nothing })
  },
}

describe('world pieces', () => {
  it('draws nothing in a layer with no pieces registered', () => {
    expect(withRegistrations([], () => worldPiecesOf('platform'))).toEqual([])
  })

  it('lists a layer’s pieces sorted by id', () => {
    const ids = withRegistrations([twoPieces], () => worldPiecesOf('platform').map((p) => p.id))
    expect(ids).toEqual(['fake-pad.a-shed', 'fake-pad.z-crane'])
  })
})

describe('vehicle staging', () => {
  it('stages nothing with no provider registered', () => {
    const state = createAuthorityState({ planetIndex: 1, planetSeed: 7, playerIds: ['p1'] })
    expect(withRegistrations([], () => vehicleStagingOf(state, 'p1'))).toBeNull()
  })
})
