import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { slotOfPartId } from '../../../systems/art/artIds'
import { lookBodyQuadsOf, lookHeadQuadsOf } from '../../../systems/render/lookPartQuads'
import { vehicleAttachPointOf } from '../../../systems/render/mountedPartLook'
import { vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { lookFrameAt, type RigLookFrame } from './render/rigLookFrames'
import { partSwapsOf } from './render/rigLookParts'
import { createRigLookSources } from './rigLookSource'
import { rigLookOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'

const ASSET_ID = 'vehicle-look-cargo-hold'
const HOLD = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'cargo_hold')!

/** Systems' thresholds (#157 comment 6300543785), Progression's names (6300549964), #580's parts. */
const STEPS = [
  { from: 23, card: 'Plank crate', part: 'plank-crate' },
  { from: 31, card: 'Ore hopper', part: 'ore-hopper' },
  { from: 33, card: 'Riveted bin', part: 'riveted-bin' },
]
const TOP = 33
const VISUAL_TIERS = [1, 2, 3]

const holdAt = (n: number): RigLookFrame => rigLookOf('cargo_hold', n)!

/** Owned purchases written straight on the state: the hold's capacity overflows long before 10,000. */
function withHoldLevel(state: AuthorityState, level: number): AuthorityState {
  const player = state.players.p1
  const vehicle = { ...player.vehicle, levels: { ...player.vehicle.levels, cargo_hold: level } }
  return { ...state, players: { ...state.players, p1: { ...player, vehicle } } }
}

/** What a frame draws: its part, asset, tint, glow and plating. */
const shownOf = (frame: RigLookFrame): string =>
  JSON.stringify([frame.partId, frame.assetId, frame.tint, frame.glows, frame.plating])

describe('cargo hold look (ticket 581)', () => {
  it('reads its three steps from the table at 23, 31 and 33 purchases', () => {
    expect(HOLD.rows.steps.map(({ from, card, part }) => ({ from, card, part }))).toEqual(STEPS)
    expect(HOLD.rows.steps.every((step) => step.asset === ASSET_ID)).toBe(true)
  })

  it('swaps no part below 23 purchases, so the rig keeps its own ore hatch', () => {
    expect(holdAt(22).partId).toBeNull()
    expect(partSwapsOf([holdAt(22)], [])).toEqual([])
  })

  it.each(STEPS)('swaps in the $card from $from purchases, in place of the hopper', (step) => {
    for (const n of [step.from, step.from + 1]) {
      const [swap] = partSwapsOf([holdAt(n)], [])
      expect(swap).toEqual({
        kind: 'swap',
        attach: 'hull.cargo',
        partIds: [step.part],
        assetId: ASSET_ID,
        replacesSlot: 'hopper',
      })
    }
  })

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

  it('keeps the Riveted bin on the tail and shows a new look on every purchase', () => {
    for (let n = TOP; n < TOP + 50; n++) {
      expect(holdAt(n + 1).partId).toBe('riveted-bin')
      expect(shownOf(holdAt(n + 1))).not.toBe(shownOf(holdAt(n)))
    }
  })

  it('changes the look at every step, from the bare rig on', () => {
    const counts = [22, ...STEPS.map((step) => step.from)]
    const shown = counts.map((n) => shownOf(holdAt(n)))
    expect(new Set(shown).size).toBe(counts.length)
  })

  it('lights the swapped-in part, so the step tint and the tail show on it', () => {
    const state = createScriptedSession().state()
    const source = createRigLookSources().find((each) => each.id === 'rig-look.cargo_hold')!
    const player = state.players.p1
    for (const n of [23, TOP + 1, TOP + 2]) {
      const levels = { ...player.vehicle.levels, cargo_hold: n }
      const players = {
        ...state.players,
        p1: { ...player, vehicle: { ...player.vehicle, levels } },
      }
      const look = source.lookOf({ ...state, players }, 'p1', 0)!
      expect(look.glows[0].slots).toContain(holdAt(n).partId)
    }
  })

  it('leaves the state digest as it was at the lowest and the highest look', () => {
    for (const n of [0, 22, TOP, 10_000]) {
      const state = withHoldLevel(createScriptedSession().state(), n)
      const digest = stateDigest(state)
      const looks = partSwapsOf([lookFrameAt(HOLD, n)], [])
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      for (const tier of VISUAL_TIERS) vehicleBodyQuadsOf(SHIPPED_ART, tier, [], looks)
      expect(stateDigest(state)).toBe(digest)
    }
  })
})
