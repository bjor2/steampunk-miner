import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { VehiclePieces } from './VehiclePieces'

// A slice bolts gear onto the car through a registered vehicle piece (#235, the #166 seam); a
// fake slice registers two through withRegistrations.

const probePieceOf = (name: string) =>
  function ProbePiece() {
    return createElement('i', { 'data-piece': name })
  }

const twoPieces: SliceDefinition = {
  id: 'gear-probe',
  register(r) {
    r.vehiclePiece({ id: 'gear-probe.z-horn', Piece: probePieceOf('horn') })
    r.vehiclePiece({ id: 'gear-probe.a-boom', Piece: probePieceOf('boom') })
  },
}

const vehiclePiecesMarkupWith = (slices: readonly SliceDefinition[]) =>
  withRegistrations(slices, () => renderToString(createElement(VehiclePieces)))

describe('vehicle pieces', () => {
  it('draws nothing on the vehicle with no piece registered, so the car stays as on main', () => {
    expect(vehiclePiecesMarkupWith([])).toBe('')
  })

  it('draws every registered piece, in id order', () => {
    expect(vehiclePiecesMarkupWith([twoPieces])).toBe(
      '<i data-piece="boom"></i><i data-piece="horn"></i>',
    )
  })
})
