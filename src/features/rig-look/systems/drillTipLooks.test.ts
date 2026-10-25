import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { slotOfPartId } from '../../../systems/art/artIds'
import { drillTipAheadOf } from '../../../systems/render/drillHeadReach'
import { lookBodyQuadsOf, lookHeadQuadsOf } from '../../../systems/render/lookPartQuads'
import { drillHeadQuadsOf, vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { everyLookFrameOf, lookFrameAt, type RigLookFrame } from './render/rigLookFrames'
import { partSwapsOf } from './render/rigLookParts'
import { createRigLookSources } from './rigLookSource'
import { rigLookOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'

const ASSET_ID = 'vehicle-look-drill-tip'
const TIP = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'drill_tip')!

/**
 * The band edges of 60 (ticket 809) to about P40: #578's five parts first, named by Progression
 * (6300549964), then the LK6 parts of ticket 815, each the aether-cut crown with one more part
 * fitted: the bit-finish steps, then the spin-blur steps.
 */
const STEPS = [
  { from: 60, card: 'Steel cone', part: 'steel-cone' },
  { from: 120, card: 'Fluted bit', part: 'fluted-bit' },
  { from: 180, card: 'Toothed crown', part: 'toothed-crown' },
  { from: 240, card: 'Gem-set crown', part: 'gem-set-crown' },
  { from: 300, card: 'Aether-cut crown', part: 'aether-cut-crown' },
  { from: 360, card: 'Carbide collar', part: 'collared-crown' },
  { from: 420, card: 'Steel ferrule', part: 'ferruled-crown' },
  { from: 480, card: 'Knurled bands', part: 'knurled-crown' },
  { from: 540, card: 'Reamer ring', part: 'reamed-crown' },
  { from: 600, card: 'Chrome face', part: 'chromed-crown' },
  { from: 660, card: 'Brass bosses', part: 'bossed-crown' },
  { from: 720, card: 'Coolant lines', part: 'cooled-crown' },
  { from: 780, card: 'Diamond inlays', part: 'inlaid-crown' },
  { from: 840, card: 'Spin halo', part: 'haloed-crown' },
  { from: 900, card: 'Blur collars', part: 'blur-collar-crown' },
  { from: 960, card: 'Spin streaks', part: 'streaked-crown' },
  { from: 1020, card: 'Double halo', part: 'double-halo-crown' },
  { from: 1080, card: 'Blur fan', part: 'fanned-crown' },
  { from: 1140, card: 'Vortex core', part: 'vortex-crown' },
  { from: 1200, card: 'Aether vortex', part: 'aether-vortex-crown' },
]
const FIRST = STEPS[0].from
const TOP = STEPS[STEPS.length - 1]
const BAND = 60
const VISUAL_TIERS = [1, 2, 3]
/** The drill_power glows the nose shares its cap with: the first group lights the bit slot too. */
const NOSE_CAP = 3

const tipAt = (n: number): RigLookFrame => rigLookOf('drill_tip', n)!

/** What a frame draws: its part, asset, tint, glow and finish. */
const shownOf = (frame: RigLookFrame): string =>
  JSON.stringify([frame.partId, frame.assetId, frame.tint, frame.glows, frame.finish])

describe('drill tip look (tickets 579 and 815)', () => {
  it('reads its twenty steps from the table, one on each band edge of 60 to 1200', () => {
    expect(TIP.rows.steps.map(({ from, card, part }) => ({ from, card, part }))).toEqual(STEPS)
    expect(TIP.rows.steps.every((step) => step.asset === ASSET_ID)).toBe(true)
    expect(TIP.rows.band.edges).toEqual(STEPS.map((step) => step.from))
  })

  it('keeps #578’s five parts as the first steps and authors to about P40 (at least 5)', () => {
    expect(STEPS.slice(0, 5).map((step) => step.part)).toEqual([
      'steel-cone',
      'fluted-bit',
      'toothed-crown',
      'gem-set-crown',
      'aether-cut-crown',
    ])
    expect(STEPS.length).toBeGreaterThanOrEqual(5)
    expect(TOP.from).toBe(TIP.rows.band.edges.at(-1))
  })

  it('swaps no part below 60 purchases, so the rig keeps its own crown', () => {
    expect(tipAt(FIRST - 1).partId).toBeNull()
    expect(partSwapsOf([tipAt(FIRST - 1)], [])).toEqual([])
  })

  it.each(STEPS)(
    'swaps in the $card from $from purchases to the next edge, in place of the drill bit',
    (step) => {
      for (const n of [step.from, step.from + 1, step.from + BAND - 1]) {
        const [swap] = partSwapsOf([tipAt(n)], [])
        expect(swap).toEqual({
          kind: 'swap',
          attach: 'drill.head',
          partIds: [step.part],
          assetId: ASSET_ID,
          replacesSlot: 'drill-bit',
        })
      }
    },
  )

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

  it.each(VISUAL_TIERS)(
    'keeps the drawn drill tip where the aether-cut crown puts it, at tier %i (ticket 789)',
    (tier) => {
      const crownTip = drillTipAheadOf(SHIPPED_ART, tier, ['aether-cut-crown'])
      for (const step of STEPS.slice(5)) {
        expect(drillTipAheadOf(SHIPPED_ART, tier, [step.part])).toBeCloseTo(crownTip, 4)
      }
    },
  )

  it('keeps the aether vortex crown past the art and shows a new finish every band', () => {
    for (let n = TOP.from; n < TOP.from + 50 * BAND; n += BAND) {
      expect(tipAt(n + BAND).partId).toBe(TOP.part)
      expect(shownOf(tipAt(n + BAND))).not.toBe(shownOf(tipAt(n)))
    }
  })

  it('changes the look at every step, from the bare rig on', () => {
    const counts = [FIRST - 1, ...STEPS.map((step) => step.from)]
    const shown = counts.map((n) => shownOf(tipAt(n)))
    expect(new Set(shown).size).toBe(counts.length)
  })

  it('lights every look part under the nose cap it shares with drill_power', () => {
    const slots = TIP.rows.glowSlots.flat()
    for (const step of STEPS) expect(slots).toContain(step.part)
    const power = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'drill_power')!
    for (const step of STEPS) expect(power.rows.glowSlots[0]).toContain(step.part)
    const brightestTip = Math.max(...everyLookFrameOf(TIP).map((frame) => frame.glows[0]))
    const brightestPower = Math.max(...everyLookFrameOf(power).map((frame) => frame.glows[0]))
    expect(brightestTip + brightestPower).toBeLessThan(NOSE_CAP)
    expect(brightestTip).toBeLessThan(1)
  })

  it('lights the swapped-in part, so the step tint and the tail show on it', () => {
    const state = createScriptedSession().state()
    const source = createRigLookSources().find((each) => each.id === 'rig-look.drill_tip')!
    const player = state.players.p1
    for (const n of [FIRST, 360, TOP.from, TOP.from + BAND, TOP.from + 2 * BAND]) {
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
    for (const n of [0, FIRST - 1, TOP.from, 10_000]) {
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
