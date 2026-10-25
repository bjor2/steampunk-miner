import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { slotOfPartId } from '../../../systems/art/artIds'
import { lookBodyQuadsOf, lookHeadQuadsOf } from '../../../systems/render/lookPartQuads'
import { vehicleAttachPointOf } from '../../../systems/render/mountedPartLook'
import { vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { everyLookFrameOf, lookFrameAt, type RigLookFrame } from './render/rigLookFrames'
import { partSwapsOf } from './render/rigLookParts'
import { createRigLookSources } from './rigLookSource'
import { rigLookOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'

const ASSET_ID = 'vehicle-look-cargo-hold'
const HOLD = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'cargo_hold')!

/**
 * The hold's authored steps on its band edges of 11 (ticket 809): Progression's three looks of
 * #580 (6300549964), then each LK4 part fitted in its socket in the ticket's order (ticket 812):
 * side racks, then strapped panniers; then the sixteen LK9 parts to about P40 (ticket 872), each
 * the pannier bin with one more part fitted on the racks and panniers or the bin: securing gear,
 * the bin's fittings, heavier gear, then the aetheric glows. Past the top step the finish bands
 * keep the top part.
 */
const BAND = 11
const FIRST_STEPS = [
  { from: 11, card: 'Plank crate', part: 'plank-crate' },
  { from: 22, card: 'Ore hopper', part: 'ore-hopper' },
  { from: 33, card: 'Riveted bin', part: 'riveted-bin' },
  { from: 44, card: 'Side racks', part: 'racked-bin' },
  { from: 55, card: 'Strapped panniers', part: 'pannier-bin' },
]
const LK9_STEPS = [
  { from: 66, card: 'Cargo nets', part: 'netted-bin' },
  { from: 77, card: 'Oiled tarp', part: 'tarped-bin' },
  { from: 88, card: 'Lock bar', part: 'barred-bin' },
  { from: 99, card: 'Brass bumper', part: 'bumpered-bin' },
  { from: 110, card: 'Cargo lantern', part: 'lamped-bin' },
  { from: 121, card: 'Lid clamps', part: 'clamped-bin' },
  { from: 132, card: 'Lock plate', part: 'locked-bin' },
  { from: 143, card: 'Load gauge', part: 'gauged-bin' },
  { from: 154, card: 'Lid handrail', part: 'railed-bin' },
  { from: 165, card: 'Pannier plates', part: 'plated-bin' },
  { from: 176, card: 'Copper lines', part: 'piped-bin' },
  { from: 187, card: 'Hoist tackle', part: 'hoisted-bin' },
  { from: 198, card: 'Aether seals', part: 'sealed-bin' },
  { from: 209, card: 'Stasis field', part: 'field-bin' },
  { from: 220, card: 'Aether halos', part: 'haloed-bin' },
  { from: 231, card: 'Aether hold', part: 'aether-bin' },
]
const STEPS = [...FIRST_STEPS, ...LK9_STEPS]
/** Systems' sizing row on ticket 872: the median bot never goes 3 planets without a step to P40. */
const LEAST_STEPS = 13
const FIRST_STEP = STEPS[0].from
const TOP = STEPS[STEPS.length - 1]
const TAIL_POINTS = [TOP.from + BAND, TOP.from + 2 * BAND, 1_000, 10_000]
const VISUAL_TIERS = [1, 2, 3]

const holdAt = (n: number): RigLookFrame => rigLookOf('cargo_hold', n)!

/** Owned purchases written straight on the state: the hold's capacity overflows long before 10,000. */
function withHoldLevel(state: AuthorityState, level: number): AuthorityState {
  const player = state.players.p1
  const vehicle = { ...player.vehicle, levels: { ...player.vehicle.levels, cargo_hold: level } }
  return { ...state, players: { ...state.players, p1: { ...player, vehicle } } }
}

/** What a frame draws: its part, asset, tint, glow and finish. */
const shownOf = (frame: RigLookFrame): string =>
  JSON.stringify([frame.partId, frame.assetId, frame.tint, frame.glows, frame.finish])

describe('cargo hold look (tickets 581, 812 and 872)', () => {
  it('reads its steps from the table, one on each band edge of 11 to about P40', () => {
    expect(HOLD.rows.steps.map(({ from, card, part }) => ({ from, card, part }))).toEqual(STEPS)
    expect(HOLD.rows.steps.every((step) => step.asset === ASSET_ID)).toBe(true)
    expect(STEPS.map((step) => step.from)).toEqual(HOLD.rows.band.edges)
  })

  it('has at least 13 authored steps, the LK4 five first, each on its edge', () => {
    expect(STEPS.length).toBeGreaterThanOrEqual(LEAST_STEPS)
    expect(STEPS.slice(0, FIRST_STEPS.length)).toEqual(FIRST_STEPS)
    STEPS.forEach((step, at) => {
      expect(step.from).toBe((at + 1) * BAND)
      expect(holdAt(step.from).step).toBe(at + 1)
    })
  })

  it('names every band with 3 words or fewer, from data', () => {
    for (const step of STEPS) expect(step.card.split(' ').length).toBeLessThanOrEqual(3)
  })

  it('swaps no part below 11 purchases, so the rig keeps its own ore hatch', () => {
    expect(holdAt(FIRST_STEP - 1).partId).toBeNull()
    expect(partSwapsOf([holdAt(FIRST_STEP - 1)], [])).toEqual([])
  })

  it.each(STEPS)(
    'swaps in the $card from $from purchases to the next edge, in place of the hopper',
    (step) => {
      for (const n of [step.from, step.from + BAND - 1]) {
        const [swap] = partSwapsOf([holdAt(n)], [])
        expect(swap).toEqual({
          kind: 'swap',
          attach: 'hull.cargo',
          partIds: [step.part],
          assetId: ASSET_ID,
          replacesSlot: 'hopper',
        })
      }
    },
  )

  it.each(VISUAL_TIERS)(
    'draws each step on hull.cargo with the hopper hidden, at tier %i',
    (tier) => {
      for (const step of STEPS) {
        const looks = partSwapsOf([holdAt(step.from)], [])
        const body = lookBodyQuadsOf(SHIPPED_ART, looks)
        expect(body.map((look) => [look.assetId, look.quad.partId])).toEqual([
          [ASSET_ID, step.part],
        ])
        expect(body[0].quad.uv).not.toBeNull()
        expect(body[0].quad.pivot).toEqual(vehicleAttachPointOf(SHIPPED_ART, 'hull.cargo')?.atM)
        expect(lookHeadQuadsOf(SHIPPED_ART, looks)).toEqual([])
        const slots = vehicleBodyQuadsOf(SHIPPED_ART, tier, [], looks).map((quad) =>
          slotOfPartId(quad.partId),
        )
        expect(slots).not.toContain('hopper')
      }
    },
  )

  it('keeps the aether hold on every finish band above the top step', () => {
    for (const n of TAIL_POINTS) expect(holdAt(n).partId).toBe(TOP.part)
    for (let n = TOP.from; n < TOP.from + 50 * BAND; n += BAND) {
      expect(holdAt(n + BAND).partId).toBe(TOP.part)
      expect(shownOf(holdAt(n + BAND))).not.toBe(shownOf(holdAt(n)))
    }
  })

  it('changes the look at every step, from the bare rig on', () => {
    const counts = [FIRST_STEP - 1, ...STEPS.map((step) => step.from)]
    const shown = counts.map((n) => shownOf(holdAt(n)))
    expect(new Set(shown).size).toBe(counts.length)
  })

  it('lights every look part itself, under the rigBody cap, so a finish shows on it', () => {
    for (const step of STEPS) expect(HOLD.rows.glowSlots.flat()).toContain(step.part)
    expect(everyLookFrameOf(HOLD).every((frame) => frame.glows.every((g) => g < 1))).toBe(true)
  })

  it('lights the swapped-in part, so the step tint and the finishes show on it', () => {
    const state = createScriptedSession().state()
    const source = createRigLookSources().find((each) => each.id === 'rig-look.cargo_hold')!
    for (const n of [FIRST_STEP, TOP.from, TOP.from + BAND, TOP.from + 2 * BAND]) {
      const look = source.lookOf(withHoldLevel(state, n), 'p1', 0)!
      expect(look.glows[0].slots).toContain(holdAt(n).partId)
    }
  })

  it('leaves the state digest as it was at the lowest and the highest look', () => {
    for (const n of [0, FIRST_STEP - 1, TOP.from, 10_000]) {
      const state = withHoldLevel(createScriptedSession().state(), n)
      const digest = stateDigest(state)
      const looks = partSwapsOf([lookFrameAt(HOLD, n)], [])
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      for (const tier of VISUAL_TIERS) vehicleBodyQuadsOf(SHIPPED_ART, tier, [], looks)
      expect(stateDigest(state)).toBe(digest)
    }
  })
})
