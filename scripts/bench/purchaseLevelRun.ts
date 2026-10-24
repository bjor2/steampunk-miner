/**
 * One `bench:purchase-levels` row run (ticket 840): passes of the row's rig down its column, each
 * from a cold planet chunk cache (as on arrival) and an empty mesh pool, until the moving ticks
 * reach `MIN_MOVING_TICKS` or `MAX_PASSES` have run. A fast rig crosses a planet in a few ticks,
 * so its tick numbers come from several passes of the same cold drive. Each frame is one tick
 * (60 a second): the cut-follow and the authority's tick, then the terrain stream, then the
 * hazard strip, all on the main thread; what the GPU, Rapier and React add is in `perf:phone` and
 * `bench:physics`, not here.
 */
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../src/constants/physics'
import { WORLD_SEED } from '../../src/systems/authority/scriptedSession'
import type { Vector2 } from '../../src/systems/vehicle/localFrame'
import { freshPlanetParamsFor } from '../../src/systems/world/planetParams'
import { generatedChunkOf } from '../../src/systems/world/worldState'
import {
  bodyMetresOf,
  cutFrontMetresOf,
  isDrivePassOver,
  startDrivePass,
  stepDrivePass,
  type DrivePass,
  type DriveTick,
} from './purchaseLevelDrive'
import { viewRadiusOfProfile, type BenchRow } from './purchaseLevelRows'
import {
  createStreamPass,
  settleStreamPass,
  streamFrame,
  type StreamFrameReading,
  type StreamFrameView,
  type StreamPass,
} from './purchaseLevelStream'
import {
  createStripPass,
  sampleStripPass,
  type StripFrameReading,
  type StripPass,
} from './purchaseLevelStrip'

const MIN_MOVING_TICKS = 60
const MAX_PASSES = 10
const DOWN = { x: 0, y: -1 }
const AT_REST = { x: 0, y: 0 }

/** Everything a row's frames read, on this machine's clock (the profile's slowdown not applied). */
export interface RowSamples {
  passes: number
  /** The authority's tick, ms, on the ticks the rig moved. */
  movingTickMs: number[]
  /** Cut-follow, tick, terrain and strip, ms, every frame. */
  frameMs: number[]
  terrainMs: number[]
  movedMm: number
  generated: number
  builds: number[]
  rigAheadFrames: number
  rigAheadLongestFrames: number
  populatedFrames: number
  warningFramesJudged: number
  warningFramesShown: number
  refusals: string[]
}

export function runRow(row: BenchRow): RowSamples {
  const samples = emptySamples()
  while (samples.passes < MAX_PASSES && samples.movingTickMs.length < MIN_MOVING_TICKS) {
    runPass(row, samples)
    samples.passes++
  }
  return samples
}

function emptySamples(): RowSamples {
  return {
    passes: 0,
    movingTickMs: [],
    frameMs: [],
    terrainMs: [],
    movedMm: 0,
    generated: 0,
    builds: [],
    rigAheadFrames: 0,
    rigAheadLongestFrames: 0,
    populatedFrames: 0,
    warningFramesJudged: 0,
    warningFramesShown: 0,
    refusals: [],
  }
}

function runPass(row: BenchRow, samples: RowSamples): void {
  evictPlanetChunkCache()
  const drive = startDrivePass(row.rig)
  const { params } = drive.armed
  const stream = createStreamPass(params, viewRadiusOfProfile(row.profile), row.profile.cpuSlowdown)
  const strip = createStripPass(params, drive.armed.session.state().world)
  settleStreamPass(stream, streamViewOf(drive, AT_REST))
  while (!isDrivePassOver(drive)) runFrame(drive, stream, strip, samples)
}

/**
 * The planet's chunk cache taken by another seed's planet, so the pass generates from cold as a
 * rig arriving on the planet does (one cache per planet, `worldState.ts`).
 */
function evictPlanetChunkCache(): void {
  generatedChunkOf(freshPlanetParamsFor(WORLD_SEED + 1, 1), 0, 0)
}

function runFrame(drive: DrivePass, stream: StreamPass, strip: StripPass, samples: RowSamples) {
  const tick = stepDrivePass(drive)
  const velocity = velocityOf(tick)
  const terrain = streamFrame(stream, streamViewOf(drive, velocity))
  const state = drive.armed.session.state()
  const hazards = sampleStripPass(strip, state, cutFrontMetresOf(drive), velocity)
  noteFrame(samples, tick, terrain, hazards)
}

/** The body's velocity over the tick, m/s, straight down. */
function velocityOf(tick: DriveTick): Vector2 {
  return { x: 0, y: (-tick.movedMm * TICKS_PER_SECOND) / MM_PER_METRE }
}

function streamViewOf(drive: DrivePass, velocity: Vector2): StreamFrameView {
  const centre = bodyMetresOf(drive)
  const world = drive.armed.session.state().world
  return { centre, velocity, facing: DOWN, world, rigPoints: [centre, cutFrontMetresOf(drive)] }
}

function noteFrame(
  samples: RowSamples,
  tick: DriveTick,
  terrain: StreamFrameReading,
  hazards: StripFrameReading,
): void {
  if (tick.movedMm > 0) samples.movingTickMs.push(tick.tickMs)
  samples.frameMs.push(tick.followMs + tick.tickMs + terrain.terrainMs + hazards.stripMs)
  samples.terrainMs.push(terrain.terrainMs)
  samples.movedMm += tick.movedMm
  samples.refusals.push(...tick.refusals)
  noteTerrain(samples, terrain)
  noteHazards(samples, hazards)
}

function noteTerrain(samples: RowSamples, terrain: StreamFrameReading): void {
  samples.generated += terrain.generated
  samples.builds.push(terrain.builds)
  if (terrain.isRigAhead) samples.rigAheadFrames++
  samples.rigAheadLongestFrames = Math.max(samples.rigAheadLongestFrames, terrain.aheadRun)
}

function noteHazards(samples: RowSamples, hazards: StripFrameReading): void {
  if (hazards.isPopulated) samples.populatedFrames++
  if (hazards.isWarningShown === null) return
  samples.warningFramesJudged++
  if (hazards.isWarningShown) samples.warningFramesShown++
}
