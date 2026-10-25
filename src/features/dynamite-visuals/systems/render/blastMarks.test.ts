import { describe, expect, it } from 'vitest'
import { PLANTED_CHARGE_SLOTS } from '../../../../constants/scene'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { casingGradeLookOf } from '../../../../systems/render/casingGradeLook'
import { CRATER_MARKS, DECALS_PER_CRATER, FUSE_SPARKS_PER_TYPE } from './blastLookConstants'
import {
  blastMarksBudgetOf,
  craterDecalCount,
  cratersAfter,
  writeRingMark,
  type BlastAnswers,
  type CraterMark,
  type RingMark,
} from './blastMarks'
import { chargeTypeLookOf, chargeTypes, RING_STROKE_M } from './chargeTypeLook'

// The marks a charge leaves and wears (D7, ticket 866): each blast's typed crater decal, kept per
// planet like the kernel scorch; and the two rings round a live charge at the radii #860 gives.

function blastStarted(tx: number, ty: number, size: number, casingLaid = false): DomainEvent {
  return {
    type: 'BlastStarted',
    tick: 1,
    tx,
    ty,
    size,
    chargeType: size <= 4 ? 1 : size <= 8 ? 2 : 3,
    radiusLevel: 0,
    baseR2: '0',
    groundR2: '0',
    blastSeq: 1,
    casingLaid,
  }
}

const planetEntered: DomainEvent = {
  type: 'PlanetEntered',
  tick: 0,
  planetSeed: 1,
  generatorVersion: 4,
  radius: 300,
}

const bare: BlastAnswers = {
  groundRadiusMmOf: (blast) => blast.size * 1000,
  casingOf: () => null,
}

const cased: BlastAnswers = {
  ...bare,
  casingOf: () => ({ grade: 2, liningType: 'standard' }),
}

describe('crater marks', () => {
  it("adds each blast's crater at its tile in its type's decal, latest last", () => {
    const craters = cratersAfter([], [blastStarted(3, 4, 1), blastStarted(-2, 9, 6)], bare)
    expect(craters.map((crater) => crater.decals.map((decal) => decal.partId))).toEqual([
      ['crater-1'],
      ['crater-2'],
    ])
    expect(craters[0]).toMatchObject({ x: 3.5, y: 4.5 })
    expect(craters[1].decals[0].tint).toBe(chargeTypeLookOf(2).soot)
  })

  it('keeps the last six craters on the planet and clears them on arrival', () => {
    const blasts = Array.from({ length: CRATER_MARKS + 3 }, (_, at) => blastStarted(at, 0, 1))
    const kept = cratersAfter([], blasts, bare)
    expect(kept).toHaveLength(CRATER_MARKS)
    expect(kept[0].x).toBe(3.5)
    expect(cratersAfter(kept, [planetEntered], bare)).toEqual([])
  })

  it("lines a cased blast's crater in the planter's grade and lining, two decals", () => {
    const [crater] = cratersAfter([], [blastStarted(0, 0, 10, true)], cased)
    expect(crater.decals.map((decal) => decal.partId)).toEqual([
      'crater-cased-rim',
      'crater-cased-trim',
    ])
    expect(crater.decals[0].tint).toBe(casingGradeLookOf(2).plate.colour)
    expect(craterDecalCount([crater])).toBe(DECALS_PER_CRATER)
    // The rim glows from the blast's tick (D8 ticket 868); a bare crater never glows.
    expect(crater.isCased).toBe(true)
    expect(cratersAfter([], [blastStarted(0, 0, 10)], bare)[0].isCased).toBe(false)
  })

  it('leaves no crater for a blast off any planet, and ignores every other event', () => {
    const offPlanet: BlastAnswers = { ...bare, groundRadiusMmOf: () => null }
    expect(cratersAfter([], [blastStarted(0, 0, 1)], offPlanet)).toEqual([])
    const kept: CraterMark[] = [{ x: 1, y: 1, turn: 0, decals: [], tick: 0, isCased: false }]
    const other: DomainEvent = {
      type: 'BlastFront',
      tick: 2,
      tx: 0,
      ty: 0,
      rInnerMm: 0,
      rOuterMm: 1,
    }
    expect(cratersAfter(kept, [other], bare)).toEqual(kept)
  })
})

describe('ring marks', () => {
  it("writes a live charge's rings at its tile, base and ground radii in metres, in its type's look", () => {
    const out: RingMark = {
      x: 0,
      y: 0,
      turn: 0,
      baseRadiusM: 0,
      groundRadiusM: 0,
      look: { colour: '', strokeM: 0, casingTint: null },
    }
    const written = writeRingMark({ tx: 2, ty: -3, size: 9 }, 3, 20_000, 23_000, 0, null, out)
    expect(written).toBe(out)
    expect(out).toMatchObject({
      x: 2.5,
      y: -2.5,
      baseRadiusM: 20,
      groundRadiusM: 23,
      look: { colour: chargeTypeLookOf(3).ring, strokeM: RING_STROKE_M, casingTint: null },
    })
  })

  it('budgets a ring per planted slot, the decals and a spark pool per type', () => {
    expect(blastMarksBudgetOf(PLANTED_CHARGE_SLOTS, chargeTypes().length)).toEqual({
      drawCalls: 2 + 3,
      instances: PLANTED_CHARGE_SLOTS + CRATER_MARKS * DECALS_PER_CRATER + 3 * FUSE_SPARKS_PER_TYPE,
    })
  })
})
