import { describe, expect, it } from 'vitest'
import { fromCanonical, mul, powInt } from '../money'
import { geometricPieceAt, geometricWorthAt } from './costCurveLookup'
import type { GeometricCostCurve } from './economyDefinition'

const m = fromCanonical

/** The shape of Systems' front-loaded drill rows on ticket 396: 8 x 1.15^L, then 1300 x 1.5^(L-17). */
const REJOINED: GeometricCostCurve = {
  id: 'cost.test.rejoined',
  family: 'geometric',
  base: m('8'),
  ratio: m('1.15'),
  pieces: [{ fromLevel: 17, base: m('1300'), ratio: m('1.5') }],
}

const PLAIN: GeometricCostCurve = {
  id: 'cost.test.plain',
  family: 'geometric',
  base: m('24'),
  ratio: m('1.225'),
}

describe('geometric cost curves in pieces', () => {
  it('prices a curve with no pieces at base x ratio^L', () => {
    expect(geometricWorthAt(PLAIN, 7)).toEqual(mul(m('24'), powInt(m('1.225'), 7)))
  })

  it('prices the levels before the first piece on the curve own base and ratio', () => {
    expect(geometricWorthAt(REJOINED, 0)).toEqual(m('8'))
    expect(geometricWorthAt(REJOINED, 16)).toEqual(mul(m('8'), powInt(m('1.15'), 16)))
  })

  it('prices a piece from its own level, its base at that level', () => {
    expect(geometricWorthAt(REJOINED, 17)).toEqual(m('1300'))
    expect(geometricWorthAt(REJOINED, 20)).toEqual(mul(m('1300'), powInt(m('1.5'), 3)))
  })

  it('answers the piece a level falls in, with the ratio its pips split at', () => {
    expect(geometricPieceAt(REJOINED, 16).ratio).toEqual(m('1.15'))
    expect(geometricPieceAt(REJOINED, 17).ratio).toEqual(m('1.5'))
    expect(geometricPieceAt(PLAIN, 40)).toEqual({ fromLevel: 0, base: m('24'), ratio: m('1.225') })
  })
})
