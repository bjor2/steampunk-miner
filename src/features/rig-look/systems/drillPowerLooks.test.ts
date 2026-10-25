import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { slotOfPartId } from '../../../systems/art/artIds'
import { drillTipAheadOf } from '../../../systems/render/drillHeadReach'
import {
  lookBodyQuadsOf,
  lookHeadQuadsOf,
  lookPartIdsOf,
} from '../../../systems/render/lookPartQuads'
import { vehicleAttachPointOf } from '../../../systems/render/mountedPartLook'
import { drillHeadQuadsOf, vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { everyLookFrameOf, type RigLookFrame } from './render/rigLookFrames'
import { partSwapsOf } from './render/rigLookParts'
import { isBandName } from './rigLookBandChecks'
import { createRigLookSources } from './rigLookSource'
import { rigLookOf, rigLookPlaqueFactOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'
import { RIG_LOOK_TABLE } from './rigLookTable'

const ASSET_ID = 'vehicle-look-drill-power'
const POWER = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'drill_power')!

/**
 * The band edges of 6 (ticket 809) to about P40: #554's nine glow rows first, with no part, then
 * the LK12 parts of ticket 875, each the drill housing with one more part fitted in a socket on
 * the gimbal drive's drum: the steam fittings, then heavier hardware, then the aether glows.
 */
const GLOW_STEPS = [
  { from: 6, card: 'Amber glow' },
  { from: 12, card: 'Ember glow' },
  { from: 18, card: 'Flame glow' },
  { from: 24, card: 'Gold glow' },
  { from: 30, card: 'Teal glow' },
  { from: 36, card: 'Violet glow' },
  { from: 42, card: 'Rose glow' },
  { from: 48, card: 'White glow' },
  { from: 54, card: 'Sun glow' },
]
const PART_STEPS = [
  { from: 60, card: 'Pressure gauge', part: 'gauged-housing' },
  { from: 66, card: 'Relief valve', part: 'valved-housing' },
  { from: 72, card: 'Steam feed', part: 'piped-housing' },
  { from: 78, card: 'Cooling fins', part: 'finned-housing' },
  { from: 84, card: 'Clamp band', part: 'clamped-housing' },
  { from: 90, card: 'Power flywheel', part: 'flywheel-housing' },
  { from: 96, card: 'Hex bolts', part: 'bolted-housing' },
  { from: 102, card: 'Iron ribs', part: 'ribbed-housing' },
  { from: 108, card: 'Copper coils', part: 'coiled-housing' },
  { from: 114, card: 'Sight lenses', part: 'lensed-housing' },
  { from: 120, card: 'Flywheel halo', part: 'haloed-housing' },
  { from: 126, card: 'Aether housing', part: 'aether-housing' },
]
/** The Systems sizing row on #875: at least 13 steps, so the median bot sees one every 3 planets. */
const LEAST_STEPS_TO_P40 = 13
const FIRST_PART = PART_STEPS[0].from
const TOP = PART_STEPS[PART_STEPS.length - 1]
const BAND = 6
const VISUAL_TIERS = [1, 2, 3]
const TAIL_POINTS = [TOP.from + BAND, TOP.from + 2 * BAND, 10_000, 1_000_000]
/** The ticket's order: steam fittings, then heavier hardware, then the aether glows. */
const FITTING_STEPS = PART_STEPS.slice(0, 6)
const HARDWARE_STEPS = PART_STEPS.slice(6, 9)
const AETHER_STEPS = PART_STEPS.slice(9)
/** The housing parts' own glow group, after the nose's and the head's (#554). */
const HOUSING_GROUP = 2
/** The drill body's parts stay under the rig body cap, the nose under the nose cap it shares. */
const RIG_BODY_CAP = RIG_LOOK_TABLE.glowCaps.rigBody
const NOSE_CAP = RIG_LOOK_TABLE.glowCaps.drillNose

const powerAt = (n: number): RigLookFrame => rigLookOf('drill_power', n)!

function swapsAt(n: number) {
  return partSwapsOf([powerAt(n)], [])
}

function drawnPartIdsAt(n: number, tier: number): string[] {
  return vehicleBodyQuadsOf(SHIPPED_ART, tier, [], swapsAt(n)).map((quad) => quad.partId)
}

/** What a frame draws: its part, asset, tint, glow and finish. */
const shownOf = (frame: RigLookFrame): string =>
  JSON.stringify([frame.partId, frame.assetId, frame.tint, frame.glows, frame.finish])

function withPowerLevel(state: AuthorityState, level: number): AuthorityState {
  const player = state.players.p1
  const vehicle = { ...player.vehicle, levels: { ...player.vehicle.levels, drill_power: level } }
  return { ...state, players: { ...state.players, p1: { ...player, vehicle } } }
}

describe('drill power look (ticket 875, LK12)', () => {
  it('reads its twenty-one steps from the table, one on each band edge of 6 to 126', () => {
    const steps = POWER.rows.steps.map(({ from, card, part }) => ({ from, card, part }))
    expect(steps).toEqual([...GLOW_STEPS.map((step) => ({ ...step, part: null })), ...PART_STEPS])
    expect(POWER.rows.band.edges).toEqual(steps.map((step) => step.from))
    expect(POWER.rows.steps.slice(9).every((step) => step.asset === ASSET_ID)).toBe(true)
  })

  it('keeps #554’s nine glow rows as the first steps and authors at least 13 steps to about P40', () => {
    expect(POWER.rows.steps.slice(0, 9).every((step) => step.part === null)).toBe(true)
    expect(POWER.rows.steps.length).toBeGreaterThanOrEqual(LEAST_STEPS_TO_P40)
    expect(TOP.from).toBe(POWER.rows.band.edges.at(-1))
  })

  it('fits the new parts in the ticket’s order: steam fittings, hardware, then aether glows', () => {
    expect(FITTING_STEPS.map((step) => step.card)).toEqual([
      'Pressure gauge',
      'Relief valve',
      'Steam feed',
      'Cooling fins',
      'Clamp band',
      'Power flywheel',
    ])
    expect(HARDWARE_STEPS.map((step) => step.card)).toEqual([
      'Hex bolts',
      'Iron ribs',
      'Copper coils',
    ])
    expect(AETHER_STEPS.map((step) => step.card)).toEqual([
      'Sight lenses',
      'Flywheel halo',
      'Aether housing',
    ])
    for (const { card } of [...GLOW_STEPS, ...PART_STEPS]) expect(isBandName(card)).toBe(true)
  })

  it('swaps no part below 60 purchases, so #554’s glows keep the bare housing', () => {
    for (const n of [0, 5, 6, 30, FIRST_PART - 1]) {
      expect(powerAt(n).partId).toBeNull()
      expect(lookPartIdsOf(SHIPPED_ART, swapsAt(n))).toEqual([])
    }
  })

  it.each(PART_STEPS)(
    'lays the $card on the drill housing from $from purchases to the next edge',
    ({ from, part }) => {
      expect(powerAt(from - 1).partId).not.toBe(part)
      for (const n of [from, from + 1, from + BAND - 1]) {
        const [swap] = swapsAt(n)
        expect(swap).toEqual({
          kind: 'swap',
          attach: 'drill.housing',
          partIds: [part],
          assetId: ASSET_ID,
        })
        expect(lookPartIdsOf(SHIPPED_ART, swapsAt(n))).toEqual([`${ASSET_ID}/${part}`])
      }
    },
  )

  it.each(VISUAL_TIERS)(
    'draws each part body-fixed at the housing point, hiding no rig part, at tier %i',
    (tier) => {
      const bare = drawnPartIdsAt(FIRST_PART - 1, tier)
      const point = vehicleAttachPointOf(SHIPPED_ART, 'drill.housing')!.atM
      for (const step of PART_STEPS) {
        const looks = swapsAt(step.from)
        const [drawn] = lookBodyQuadsOf(SHIPPED_ART, looks)
        expect(drawn.quad.partId).toBe(step.part)
        expect(drawn.quad.pivot).toEqual(point)
        expect(drawn.quad.uv).not.toBeNull()
        expect(lookHeadQuadsOf(SHIPPED_ART, looks)).toEqual([])
        expect(drawnPartIdsAt(step.from, tier)).toEqual(bare)
      }
    },
  )

  it.each(VISUAL_TIERS)(
    'adds no second head sprite and never moves the drawn drill tip, at tier %i (ticket 789)',
    (tier) => {
      const bareHead = drillHeadQuadsOf(SHIPPED_ART, tier, [], []).map((quad) => quad.partId)
      const bareTip = drillTipAheadOf(SHIPPED_ART, tier)
      for (const step of PART_STEPS) {
        const looks = swapsAt(step.from)
        const head = drillHeadQuadsOf(SHIPPED_ART, tier, [], looks).map((quad) => quad.partId)
        expect(head).toEqual(bareHead)
        expect(head.map(slotOfPartId)).toContain('drill-head')
        expect(drillTipAheadOf(SHIPPED_ART, tier, [step.part])).toBe(bareTip)
      }
    },
  )

  it('keeps the aether housing on every finish band above the top step', () => {
    for (const n of TAIL_POINTS) {
      expect(lookPartIdsOf(SHIPPED_ART, swapsAt(n))).toEqual([`${ASSET_ID}/${TOP.part}`])
    }
  })

  it('shows a different look on each neighbouring band from the top step on', () => {
    for (let n = TOP.from - 1; n < TOP.from + 60 * BAND; n += BAND) {
      expect(shownOf(powerAt(n + BAND))).not.toBe(shownOf(powerAt(n)))
    }
  })

  it('changes the look at every step, from the bare rig on', () => {
    const counts = [
      0,
      ...GLOW_STEPS.map((step) => step.from),
      ...PART_STEPS.map((step) => step.from),
    ]
    const shown = counts.map((n) => shownOf(powerAt(n)))
    expect(new Set(shown).size).toBe(counts.length)
  })

  it('lights every housing part in its own group under the rig body cap, so a finish shows on it', () => {
    const housing = POWER.rows.glowSlots[HOUSING_GROUP]
    expect(housing).toEqual(PART_STEPS.map((step) => step.part))
    for (const frame of everyLookFrameOf(POWER)) {
      expect(frame.glows[HOUSING_GROUP]).toBeLessThan(RIG_BODY_CAP)
    }
    for (const step of POWER.rows.steps.slice(0, 9)) expect(step.glows[HOUSING_GROUP]).toBe(0)
    for (const step of POWER.rows.steps.slice(9))
      expect(step.glows[HOUSING_GROUP]).toBeGreaterThan(0)
  })

  it('keeps the nose the brightest part: #554’s bit glow never dims and stays under the shared cap', () => {
    const bitGlows = POWER.rows.steps.map((step) => step.glows[0])
    bitGlows.slice(1).forEach((glow, at) => expect(glow).toBeGreaterThanOrEqual(bitGlows[at]))
    const tip = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'drill_tip')!
    const brightestTip = Math.max(...everyLookFrameOf(tip).map((frame) => frame.glows[0]))
    const brightestBit = Math.max(...bitGlows)
    expect(brightestBit + brightestTip).toBeLessThan(NOSE_CAP)
    const brightestHousing = Math.max(
      ...everyLookFrameOf(POWER).map((frame) => frame.glows[HOUSING_GROUP]),
    )
    expect(brightestHousing).toBeLessThan(brightestBit)
  })

  it('names the owned band on the hover line from the first glow row, the finish past the art', () => {
    expect(rigLookPlaqueFactOf('drill_power', 5)).toBeNull()
    expect(rigLookPlaqueFactOf('drill_power', 6)).toBe('Fitting: Amber glow')
    expect(rigLookPlaqueFactOf('drill_power', 60)).toBe('Fitting: Pressure gauge')
    expect(rigLookPlaqueFactOf('drill_power', 131)).toBe('Fitting: Aether housing')
    expect(rigLookPlaqueFactOf('drill_power', 132)).toBe('Fitting: Gilt · L132')
    expect(rigLookPlaqueFactOf('drill_power', 1_000_000)).toBe('Fitting: Gilt · L1,000,000')
  })

  it('lights the fitted part, so the step tint and the tail show on it', () => {
    const state = createScriptedSession().state()
    const source = createRigLookSources().find((each) => each.id === 'rig-look.drill_power')!
    for (const n of [FIRST_PART, 96, TOP.from, TOP.from + BAND, TOP.from + 2 * BAND]) {
      const look = source.lookOf(withPowerLevel(state, n), 'p1', 0)!
      expect(look.glows[HOUSING_GROUP].slots).toContain(powerAt(n).partId)
      expect(look.glows[HOUSING_GROUP].glow).toBeGreaterThan(0)
    }
  })

  it('leaves the state digest byte-identical at the lowest and the highest look', () => {
    const digests = [0, FIRST_PART, TOP.from, 1_000_000].map((n) => {
      const state = withPowerLevel(createScriptedSession().state(), n)
      const digest = stateDigest(state)
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      for (const tier of VISUAL_TIERS) vehicleBodyQuadsOf(SHIPPED_ART, tier, [], swapsAt(n))
      expect(stateDigest(state)).toBe(digest)
      return stateDigest(withPowerLevel(state, 0))
    })
    expect(new Set(digests).size).toBe(1)
  })
})
