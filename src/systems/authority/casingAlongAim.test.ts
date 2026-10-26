import { describe, expect, it } from 'vitest'
import { STANDARD_CASING_KIND } from '../../constants/balance'
import { aimVectorOf, type Aim } from '../vehicle/aim'
import { drillStampRadiusMmAlong } from '../vehicle/drillBore'
import {
  chunkOfSample,
  ISO_DENSITY,
  localSampleOf,
  MM_PER_SAMPLE,
  sampleIndexOf,
} from '../world/sampleGrid'
import { currentCasingOfChunk, currentDensityOfChunk } from '../world/worldState'
import {
  backOut,
  chargedLengthMmOf,
  cutSweptLegAlong,
  DOWN,
  DOWN_RIGHT,
  LEG_MM,
  OFF_AXIS,
  pointAlong,
  reportedLegAlong,
  sweptLegAlong,
  type MmPoint,
} from './casingAimFixtures'
import { continueScriptedSession, PARAMS, type ScriptedSession } from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'

// Ticket 833: the casing ring follows the cut's aim. A dig along any aim lines both walls of its
// shaft with no unlined run longer than a sample, a 45 degree shaft's out to its 0.787 m wall, and
// its lining is billed per metre of the cut's centre line at either pose spacing, with no charge
// for the angle (Systems, the VS and the HS on #833). The legs are `casingAimFixtures.ts`'s.

/** As the casing lane reads a leg (`casingLegFixtures.ts`): its start and its last rings left out. */
const START_LEFT_OUT_MM = 2000
const END_LEFT_OUT_MM = 3000

const rejectionsOf = (session: ScriptedSession) =>
  session.events().filter((event) => event.type === 'CommandRejected')

/** A wall sample read beside the leg: where it lies and how far across the leg from its line. */
interface WallSample {
  sx: number
  sy: number
  acrossMm: number
  isLined: boolean
}

/**
 * The rock beside air within a sample past the ring's reach of the leg's line, between its first
 * 2 m and its last 3 m, as the casing lane reads a leg.
 */
function wallBesideLeg(session: ScriptedSession, aim: Aim): WallSample[] {
  const reachMm = drillStampRadiusMmAlong(aim) + STANDARD_CASING_KIND.ringOutsideMm + MM_PER_SAMPLE
  const from = pointAlong(aim, 0)
  const ahead = aimVectorOf(0, 1024, aim)
  const box = boxAround(from, pointAlong(aim, LEG_MM), reachMm)
  const wall: WallSample[] = []
  for (let sy = box.minSy; sy <= box.maxSy; sy++) {
    for (let sx = box.minSx; sx <= box.maxSx; sx++) {
      const dx = sx * MM_PER_SAMPLE - from.xMm
      const dy = sy * MM_PER_SAMPLE - from.yMm
      const alongMm = (dx * ahead.x + dy * ahead.y) / 1024
      const acrossMm = Math.abs(dx * ahead.y - dy * ahead.x) / 1024
      const isBeside = alongMm >= START_LEFT_OUT_MM && alongMm <= LEG_MM - END_LEFT_OUT_MM
      if (!isBeside || acrossMm >= reachMm || !isWallSample(session, sx, sy)) continue
      wall.push({ sx, sy, acrossMm, isLined: casingAt(session, sx, sy) > 0 })
    }
  }
  return wall
}

function boxAround(a: MmPoint, b: MmPoint, reachMm: number) {
  const sampleOf = (mm: number) => Math.floor(mm / MM_PER_SAMPLE)
  return {
    minSx: sampleOf(Math.min(a.xMm, b.xMm) - reachMm),
    maxSx: sampleOf(Math.max(a.xMm, b.xMm) + reachMm),
    minSy: sampleOf(Math.min(a.yMm, b.yMm) - reachMm),
    maxSy: sampleOf(Math.max(a.yMm, b.yMm) + reachMm),
  }
}

function densityAt(session: ScriptedSession, sx: number, sy: number): number {
  const world = session.state().world
  const density = currentDensityOfChunk(world, PARAMS, chunkOfSample(sx), chunkOfSample(sy))
  return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

function casingAt(session: ScriptedSession, sx: number, sy: number): number {
  const casing = currentCasingOfChunk(session.state().world, chunkOfSample(sx), chunkOfSample(sy))
  return casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

function isWallSample(session: ScriptedSession, sx: number, sy: number): boolean {
  if (densityAt(session, sx, sy) <= ISO_DENSITY) return false
  const neighbours = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ]
  return neighbours.some(([dx, dy]) => densityAt(session, sx + dx, sy + dy) <= ISO_DENSITY)
}

/** The size of the largest group of unlined wall samples touching, diagonals included. */
function worstUnlinedRunOf(wall: readonly WallSample[]): number {
  const unlined = new Set(wall.filter((sample) => !sample.isLined).map(keyOf))
  const seen = new Set<string>()
  let worst = 0
  for (const key of unlined) {
    if (seen.has(key)) continue
    seen.add(key)
    const stack = [key]
    let size = 0
    while (stack.length > 0) {
      const [sx, sy] = (stack.pop() as string).split(',').map(Number)
      size++
      for (const next of touchingKeysOf(sx, sy)) {
        if (!unlined.has(next) || seen.has(next)) continue
        seen.add(next)
        stack.push(next)
      }
    }
    worst = Math.max(worst, size)
  }
  return worst
}

function touchingKeysOf(sx: number, sy: number): string[] {
  const keys: string[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) keys.push(`${sx + dx},${sy + dy}`)
  }
  return keys
}

function keyOf({ sx, sy }: { sx: number; sy: number }): string {
  return `${sx},${sy}`
}

const AIMS: readonly (readonly [string, Aim])[] = [
  ['straight down', DOWN],
  ['at 45 degrees', DOWN_RIGHT],
  ['5/64 turn off straight down', OFF_AXIS],
]

describe('casing along the cut’s aim (ticket 833)', () => {
  it.each(AIMS)(
    'lines both walls of a swept dig %s with no unlined run past a sample',
    (_, aim) => {
      const session = sweptLegAlong(aim)
      expect(rejectionsOf(session)).toEqual([])
      const wall = wallBesideLeg(session, aim)
      expect(wall.length).toBeGreaterThan(20)
      expect(worstUnlinedRunOf(wall)).toBeLessThanOrEqual(1)
    },
  )

  it('lines a 45 degree shaft’s wall rock past 0.85 m, where a facing’s ring stopped', () => {
    const wall = wallBesideLeg(sweptLegAlong(DOWN_RIGHT), DOWN_RIGHT)
    const pastFacingRing = wall.filter((sample) => sample.acrossMm >= 850)
    expect(pastFacingRing.length).toBeGreaterThan(10)
    expect(pastFacingRing.filter((sample) => !sample.isLined)).toEqual([])
  })

  it('bills a 10 m swept 45 degree leg 10 m of lining, give or take a ring', () => {
    const charged = chargedLengthMmOf(sweptLegAlong(DOWN_RIGHT).events())
    expect(Math.abs(charged - LEG_MM)).toBeLessThanOrEqual(500)
  })

  it.each([500, 1000])(
    'bills a 10 m 45 degree leg reported every %i mm 10 m of lining, give or take a ring',
    (spacingMm) => {
      const session = reportedLegAlong(DOWN_RIGHT, spacingMm)
      expect(rejectionsOf(session)).toEqual([])
      expect(Math.abs(chargedLengthMmOf(session.events()) - LEG_MM)).toBeLessThanOrEqual(500)
    },
  )

  it('keeps each waiting point’s aim across a save, so a restored dig lays the same rings', () => {
    const { session, end } = cutSweptLegAlong(DOWN_RIGHT)
    const waiting = session.vehicle().casingTrail.unlined
    expect(waiting.length).toBeGreaterThan(0)
    expect(waiting.every((point) => point.aim === DOWN_RIGHT)).toBe(true)
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in restored)) throw new Error(restored.problems.join('; '))
    const resumed = continueScriptedSession(restored.state)
    backOut(session, DOWN_RIGHT, end)
    backOut(resumed, DOWN_RIGHT, end)
    expect(stateDigest(resumed.state())).toBe(stateDigest(session.state()))
  })

  it.each([DOWN, 64, 56.5])('refuses a save whose waiting point carries the aim %s', (aim) => {
    const { session } = cutSweptLegAlong(DOWN_RIGHT)
    const snapshot = JSON.parse(JSON.stringify(takeSnapshot(session.state())))
    snapshot.state.players.p1.vehicle.casingTrail.unlined[0].aim = aim
    expect(readSnapshot(snapshot).problems).toEqual([
      expect.stringContaining('casingTrail must hold'),
    ])
  })

  // The same rule as #829: a ring holds where its grade is at least what every cell it touches
  // requires, as each lined sample is judged at its own cell's band (`wallWeakness.ts`), so a
  // diagonal leg crossing into band 2 needs band 2's grade and never dodges it at an angle.
  it.each([
    ['band 1’s grade', 1, [2]],
    ['band 2’s grade', 2, []],
  ])(
    'warns of a collapse along a 45 degree leg into band 2 lined at %s only where it falls short',
    (_, grade, warnedBands) => {
      const warned = sweptLegAlong(DOWN_RIGHT, grade)
        .events()
        .flatMap((event) => (event.type === 'CollapseWarned' ? [event.band] : []))
      expect([...new Set(warned)]).toEqual(warnedBands)
    },
  )
})
