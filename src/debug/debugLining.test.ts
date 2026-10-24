import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { groundGatePresence, NO_DRAWN_GROUND } from '../scene/groundGatePresence'
import { casingBlinkPresence } from '../scene/terrainCasingBlink'
import { resetGameStore } from '../store/gameStore'
import { casingLookBitsOf, NO_CASING_LOOK } from '../systems/render/casingLookBits'
import { LINED_BIT, NO_GATE_BITS } from '../systems/render/cellGateBits'
import { CASING_LINING_PHONE_CELL_PX } from '../constants/scene'
import { createDebugApi } from './debugApi'

// Ticket 315 at the debug API seam: what the phone-size e2e reads of a lined cell. The chunk
// pool's read of drawn gate bits is the scene's registry; a spec stands in for the pool there.

const LINED_TILE = { tx: 3, ty: 4 }
const REFRACTORY = 1
const isLinedTile = (tile: { tx: number; ty: number }) =>
  tile.tx === LINED_TILE.tx && tile.ty === LINED_TILE.ty

beforeEach(() => {
  resetGameStore()
  groundGatePresence.gateBitsAt = (tile) => (isLinedTile(tile) ? LINED_BIT : NO_GATE_BITS)
  groundGatePresence.casingBitsAt = (tile) =>
    isLinedTile(tile) ? casingLookBitsOf(3, REFRACTORY) : NO_CASING_LOOK
})

afterEach(() => {
  groundGatePresence.gateBitsAt = NO_DRAWN_GROUND
  groundGatePresence.casingBitsAt = NO_DRAWN_GROUND
  casingBlinkPresence.count = 0
})

const linedAt = (tx: unknown, ty: unknown, pixels: unknown) =>
  createDebugApi().ui.getDrawnLiningAt(tx, ty, pixels)

describe('debug api: drawn casing lining (ticket 315)', () => {
  it('reads a lined tile as lined and readable at phone size', () => {
    const result = linedAt(LINED_TILE.tx, LINED_TILE.ty, CASING_LINING_PHONE_CELL_PX)
    expect(result).toMatchObject({ ok: true, lining: { isLined: true, isReadable: true } })
  })

  it('reads a drawn tile with no lining as unlined', () => {
    expect(linedAt(0, 0, CASING_LINING_PHONE_CELL_PX)).toMatchObject({
      ok: true,
      lining: { isLined: false, casing: null, blinkShare: 0 },
    })
  })

  it("reads the plate, finish, pips and lining type a tile's casing slot draws (ticket 830)", () => {
    expect(linedAt(LINED_TILE.tx, LINED_TILE.ty, CASING_LINING_PHONE_CELL_PX)).toMatchObject({
      ok: true,
      lining: {
        casing: { plate: 'iron', finish: 'plain', pips: 0, liningType: 'refractory' },
        isReadable: true,
      },
    })
  })

  it('reads how red the lining blinks over a block warning of collapse (ticket 830)', () => {
    const slot = casingBlinkPresence.slots[0]
    Object.assign(slot, { x0: 0, y0: 4, size: 4, progress: 0, elapsedTicks: 0 })
    casingBlinkPresence.count = 1
    casingBlinkPresence.isMotionReduced = false
    const read = linedAt(LINED_TILE.tx, LINED_TILE.ty, CASING_LINING_PHONE_CELL_PX)
    expect(read).toMatchObject({ ok: true, lining: { blinkShare: 1 } })
    expect(linedAt(0, 0, CASING_LINING_PHONE_CELL_PX)).toMatchObject({
      lining: { blinkShare: 0 },
    })
  })

  it('reads null where no ground is drawn', () => {
    groundGatePresence.gateBitsAt = NO_DRAWN_GROUND
    expect(linedAt(0, 0, CASING_LINING_PHONE_CELL_PX)).toEqual({ ok: true, lining: null })
  })

  it('refuses a fractional tile or a cell size of 0, with every problem', () => {
    const result = linedAt(0.5, 0, 0)
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.problems).toHaveLength(2)
  })
})
