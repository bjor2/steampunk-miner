import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { slotOfPartId } from '../../../systems/art/artIds'
import { lookBodyQuadsOf, lookHeadQuadsOf } from '../../../systems/render/lookPartQuads'
import { drillHeadQuadsOf, vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { lookFrameAt, type RigLookFrame } from './render/rigLookFrames'
import { partSwapsOf } from './render/rigLookParts'
import { createRigLookSources } from './rigLookSource'
import { rigLookOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'

const ASSET_ID = 'vehicle-look-drill-tip'
const TIP = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'drill_tip')!

/** Systems' thresholds (#157 comment 6300543785), Progression's names (6300549964), #578's parts. */
const STEPS = [
  { from: 70, card: 'Steel cone', part: 'steel-cone' },
  { from: 100, card: 'Fluted bit', part: 'fluted-bit' },
  { from: 130, card: 'Toothed crown', part: 'toothed-crown' },
  { from: 190, card: 'Gem-set crown', part: 'gem-set-crown' },
  { from: 280, card: 'Aether-cut crown', part: 'aether-cut-crown' },
]
const TOP = 280
const VISUAL_TIERS = [1, 2, 3]

const tipAt = (n: number): RigLookFrame => rigLookOf('drill_tip', n)!

/** What a frame draws: its part, asset, tint, glow and plating. */
const shownOf = (frame: RigLookFrame): string =>
  JSON.stringify([frame.partId, frame.assetId, frame.tint, frame.glows, frame.plating])

describe('drill tip look (ticket 579)', () => {
  it('reads its five steps from the table at 70, 100, 130, 190 and 280 purchases', () => {
    expect(TIP.rows.steps.map(({ from, card, part }) => ({ from, card, part }))).toEqual(STEPS)
    expect(TIP.rows.steps.every((step) => step.asset === ASSET_ID)).toBe(true)
  })

  it('swaps no part below 70 purchases, so the rig keeps its own crown', () => {
    expect(tipAt(69).partId).toBeNull()
    expect(partSwapsOf([tipAt(69)], [])).toEqual([])
  })

  it.each(STEPS)('swaps in the $card from $from purchases, in place of the drill bit', (step) => {
    for (const n of [step.from, step.from + 1]) {
      const [swap] = partSwapsOf([tipAt(n)], [])
      expect(swap).toEqual({
        kind: 'swap',
        attach: 'drill.head',
        partIds: [step.part],
        assetId: ASSET_ID,
        replacesSlot: 'drill-bit',
      })
    }
  })

  it.each(VISUAL_TIERS)(
    'draws each step on the swivelling head with the bit hidden, at tier %i',
    (tier) => {
      for (const step of STEPS) {
        const looks = partSwapsOf([tipAt(step.from)], [])
        const head = lookHeadQuadsOf(SHIPPED_ART, looks)
        expect(head.map((look) => [look.assetId, look.quad.partId])).toEqual([
          [ASSET_ID, step.part],
        ])
        expect(head[0].quad.uv).not.toBeNull()
        expect(lookBodyQuadsOf(SHIPPED_ART, looks)).toEqual([])
        const slots = [
          ...drillHeadQuadsOf(SHIPPED_ART, tier, [], looks),
          ...vehicleBodyQuadsOf(SHIPPED_ART, tier, [], looks),
        ].map((quad) => slotOfPartId(quad.partId))
        expect(slots).not.toContain('drill-bit')
      }
    },
  )

  it('keeps the Aether-cut crown on the tail and shows a new look on every purchase', () => {
    for (let n = TOP; n < TOP + 50; n++) {
      expect(tipAt(n + 1).partId).toBe('aether-cut-crown')
      expect(shownOf(tipAt(n + 1))).not.toBe(shownOf(tipAt(n)))
    }
  })

  it('changes the look at every step, from the bare rig on', () => {
    const counts = [69, ...STEPS.map((step) => step.from)]
    const shown = counts.map((n) => shownOf(tipAt(n)))
    expect(new Set(shown).size).toBe(counts.length)
  })

  it('lights the swapped-in part, so the step tint and the tail show on it', () => {
    const state = createScriptedSession().state()
    const source = createRigLookSources().find((each) => each.id === 'rig-look.drill_tip')!
    const player = state.players.p1
    for (const n of [70, TOP + 1, TOP + 2]) {
      const levels = { ...player.vehicle.levels, drill_tip: n }
      const players = {
        ...state.players,
        p1: { ...player, vehicle: { ...player.vehicle, levels } },
      }
      const look = source.lookOf({ ...state, players }, 'p1', 0)!
      expect(look.glows[0].slots).toContain(tipAt(n).partId)
    }
  })

  it('leaves the state digest as it was at the lowest and the highest look', () => {
    for (const n of [0, 69, TOP, 10_000]) {
      const session = createScriptedSession()
      session.submit(1, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: n } })
      const state = session.state()
      const digest = stateDigest(state)
      partSwapsOf([lookFrameAt(TIP, n)], [])
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      expect(stateDigest(state)).toBe(digest)
    }
  })
})
