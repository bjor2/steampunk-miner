import RAPIER from '@dimforge/rapier3d-compat'
import { requiredCasingGrade } from '../systems/economy/casingGrades'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { UP_VECTOR_SCALE } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { readLocalVehicle, resetGameStore, useGameStore } from '../store/gameStore'
import { onCurveSteps } from '../systems/economy/vehicleStats'
import { buildIntent } from '../systems/input/buildIntent'
import { drillStampRadiusMm } from '../systems/vehicle/drillBore'
import { withDrillSideClearance } from '../systems/vehicle/drillBoreFixtures'
import {
  FACING,
  facingVectorOf,
  type IntegerVector,
  type VehiclePose,
} from '../systems/vehicle/vehiclePose'
import { isLined } from '../systems/world/chunkDelta'
import {
  MM_PER_SAMPLE,
  SOLID_DENSITY,
  chunkOfSample,
  localSampleOf,
  sampleIndexOf,
} from '../systems/world/sampleGrid'
import { currentCasingOfChunk } from '../systems/world/worldState'
import { createRig, type Rig } from './cutFollowFixtures'

// Drilling through laid casing (ticket 843, Bjor's "can't get through the casing" after #789):
// lining is band-G rock of its grade on the planet it lies on (#41 `casingHardness`), and #41's
// Systems ruling makes it "boreable, not free and not a wall". Grade 5 is what planet 1's core
// asks, and it carries to the next planet, where its lining is that planet's band-5 rock: a rig
// that arrived with the last planet's kit, short of its next tip major, met a wall there. Its
// stamp cut the rock behind the lining and the body stood on the lining (#789's sliver).
//
// Each row arrives on a planet with the previous planet's on-curve kit, or on planet 2 with a few
// tip pips short of the first major (the reported case: red before ticket 843), at the shipped
// bore and a wider side clearance (#661). Standing in its own shaft, it meets a bore of its own
// width three metres to the side or below, lined at its planet's band-5 grade as the vehicle lines
// one (ticket 829's ladder: on planet 2 grade 9, the rock old grade 5 was there), and drives
// into it: through the near lining, across the bore and out through the far lining. Lining that
// hard for the tip holds the rig a few seconds; ten seconds of drive must see it through.
//
// The planned 150 mm clearance (#662) is left out: there the rig also stalls entering the bore from
// the side where its lining is no wall (planet 3's kit), as the 0.9 m body is taller than the
// circle near its edge, and cannot start down from rest on planet 2 before any lining: findings
// for the width work, not casing.

const FRAMES_PER_SECOND = 60
const CUT_TICKS = 600
/** How far ahead of the rig, centre to centre, the lined bore it drives into lies. */
const BORE_AHEAD_MM = 3000
/** Planet 2's pad reaches some 9 m past its dock; this drive clears it on every planet here. */
const OFF_DOCK_TICKS = 150
/** The lining's thickness (#41 amendment 2: one ring, the annulus's rock side). */
const LINING_MM = 250
/** Half the 0.9 m body: its back is this far behind its centre. */
const HALF_BODY_MM = 450
/** The line ahead judged for lining: across the body's middle, inside the narrowest bore. */
const LINE_HALF_WIDTH_MM = 200

interface Arrival {
  name: string
  planetIndex: number
  levels: Record<string, number>
}

/** The pips of drill tip bought short of its first major: the gate still reads the starting tip. */
const EARLY_TIP_PIPS = [3, 6, 9]

const ARRIVALS: readonly Arrival[] = [
  ...EARLY_TIP_PIPS.map((pips) => ({
    name: `planet 2 with ${pips} tip pips`,
    planetIndex: 2,
    levels: { ...onCurveSteps(1), drill_tip: pips },
  })),
  { name: "planet 2 on planet 1's kit", planetIndex: 2, levels: { ...onCurveSteps(1) } },
  { name: "planet 3 on planet 2's kit", planetIndex: 3, levels: { ...onCurveSteps(2) } },
  { name: "planet 4 on planet 3's kit", planetIndex: 4, levels: { ...onCurveSteps(3) } },
]

const SIDE_CLEARANCES_MM = [500, 1000]

const CUTS = [
  { from: 'the side', aim: 'aim_left', facing: FACING.left },
  { from: 'above', aim: 'aim_down', facing: FACING.down },
] as const

type Cut = (typeof CUTS)[number]

interface CasingCrossing {
  arrival: Arrival
  clearanceMm: number
  cut: Cut
}

const ROWS: readonly CasingCrossing[] = ARRIVALS.flatMap((arrival) =>
  SIDE_CLEARANCES_MM.flatMap((clearanceMm) => CUTS.map((cut) => ({ arrival, clearanceMm, cut }))),
)

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  const sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'casing-crossing', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

interface Crossed {
  liningOnLine: number
  movedMm: number
  /** Where the far lining's outer edge lies along the aim from the start, plus the body's half. */
  throughMm: number
}

function crossLinedBore({ arrival, clearanceMm, cut }: CasingCrossing): Crossed {
  return withDrillSideClearance(clearanceMm, () => {
    const rig = createRig(RAPIER, arrival.levels, FRAMES_PER_SECOND, undefined, arrival.planetIndex)
    useGameStore.getState().setCasingGrade(band5GradeOn(arrival.planetIndex))
    standInOwnShaft(rig)
    const start = poseNow()
    const along = facingVectorOf(start.upx, start.upy, cut.facing)
    const farEdgeMm = BORE_AHEAD_MM + drillStampRadiusMm() + LINING_MM
    layLinedBoreAhead(start, along, band5GradeOn(arrival.planetIndex))
    const liningOnLine = liningOnLineOf(start, along, farEdgeMm)
    rig.hold(buildIntent([cut.aim]), CUT_TICKS)
    return {
      liningOnLine,
      movedMm: movedAlong(start, poseNow(), along),
      throughMm: farEdgeMm + HALF_BODY_MM,
    }
  })
}

/** The grade the planet's band 5 needs: the hardest lining a rig meets there, which never bursts. */
function band5GradeOn(planetIndex: number): number {
  return Number(requiredCasingGrade({ planetIndex, band: 5 }))
}

/** Off the dock, clear of its pad, and a short shaft down, settled on its bottom. */
function standInOwnShaft(rig: Rig): void {
  rig.hold(buildIntent(['aim_left']), OFF_DOCK_TICKS)
  rig.hold(buildIntent([]), 60)
  rig.hold(buildIntent(['aim_down']), 150)
  rig.hold(buildIntent([]), 120)
}

/** A bore of the rig's own width centred `BORE_AHEAD_MM` along the aim, lined as the rig lines. */
function layLinedBoreAhead(start: VehiclePose, along: IntegerVector, grade: number): void {
  const centre = {
    x: start.x + Math.floor((along.x * BORE_AHEAD_MM) / UP_VECTOR_SCALE),
    y: start.y + Math.floor((along.y * BORE_AHEAD_MM) / UP_VECTOR_SCALE),
  }
  const store = useGameStore.getState()
  store.carveCircle({ ...centre, radius: drillStampRadiusMm(), amount: SOLID_DENSITY })
  store.lineCasing({ ...centre, grade })
}

function poseNow(): VehiclePose {
  const pose = readLocalVehicle().pose
  if (pose === null) throw new Error('the vehicle has no pose')
  return pose
}

function movedAlong(start: VehiclePose, end: VehiclePose, along: IntegerVector): number {
  return ((end.x - start.x) * along.x + (end.y - start.y) * along.y) / UP_VECTOR_SCALE
}

/** Lined samples on the line from the body's face to `toMm` along the aim. */
function liningOnLineOf(start: VehiclePose, along: IntegerVector, toMm: number): number {
  const reach = Math.ceil(toMm / MM_PER_SAMPLE) + 1
  const sx0 = Math.floor(start.x / MM_PER_SAMPLE)
  const sy0 = Math.floor(start.y / MM_PER_SAMPLE)
  let lined = 0
  for (let sy = sy0 - reach; sy <= sy0 + reach; sy++) {
    for (let sx = sx0 - reach; sx <= sx0 + reach; sx++) {
      const isOnLine = isOnLineAhead(start, along, { x: sx, y: sy }, toMm)
      if (isOnLine && isLined(casingAt(sx, sy))) lined++
    }
  }
  return lined
}

function isOnLineAhead(
  start: VehiclePose,
  along: IntegerVector,
  sample: IntegerVector,
  toMm: number,
): boolean {
  const dx = sample.x * MM_PER_SAMPLE - start.x
  const dy = sample.y * MM_PER_SAMPLE - start.y
  const ahead = (dx * along.x + dy * along.y) / UP_VECTOR_SCALE
  const across = (dy * along.x - dx * along.y) / UP_VECTOR_SCALE
  return ahead >= HALF_BODY_MM && ahead <= toMm && Math.abs(across) <= LINE_HALF_WIDTH_MM
}

function casingAt(sx: number, sy: number): number {
  const world = readAuthorityState().world
  const casing = currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy))
  return casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

const ROW = '$arrival.name, side clearance $clearanceMm mm, from $cut.from'

describe('drilling through laid casing (ticket 843)', () => {
  it.each(ROWS)(`cuts in and out through a band-5-grade lined bore, ${ROW}`, (row) => {
    const { liningOnLine, movedMm, throughMm } = crossLinedBore(row)
    expect(liningOnLine).toBeGreaterThan(0)
    expect(movedMm).toBeGreaterThanOrEqual(throughMm)
  })
})
