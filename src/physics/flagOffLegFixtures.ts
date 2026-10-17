/**
 * One flag-off leg of the live loop, read for #514's loop gates (Done-when 1, 2 and 9): a rig on
 * planet 1 at a chosen report cadence (`drill.reportEveryTick` on, with the authority's
 * `drill.exactCarry` that every tick needs and ships with, for a report every tick while the drill
 * bites; both off for 12 ticks, as the game ships today) leaves the pad, then drills down, or dives 12 m and drills level,
 * for a set length, lined at casing grade 5 so a cave-in never ends it; then lets go. Per leg:
 * - the whole-leg mean speed and the cells it yielded a second, and its law work a metre
 *   (`digSpeedWindow.ts`);
 * - backward ticks (moving against the facing) and under-half ticks (under half the leg's mean),
 *   as shares of the ticks after the first cut;
 * - press to first cut: ticks from the first tick the head faces the leg's way (the swivel done)
 *   to the first tick the ground lost density, 0 when it is the same tick;
 * - release: the metres it crept and the ticks it took to rest (under 0.05 m/s for 6 ticks), read
 *   until a tow back to the dock, which is flagged.
 * Test support for `flagOffLadder.lane.test.ts`; the spec installs the run log's memory sink.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import type { DevFlags } from '../constants/devFlags'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import type { MemorySink } from '../logging/eventSink'
import { submitCommand } from '../store/authorityLink'
import { withDrillExactCarry } from '../systems/authority/cutCarryFixtures'
import { readLocalVehicle, useGameStore } from '../store/gameStore'
import { setCasingGradeCommand } from '../systems/authority/casingDebugCommands'
import { heatThrottledDrill } from '../systems/authority/heatRules'
import { blockHardness } from '../systems/economy/oreEconomy'
import { buildIntent } from '../systems/input/buildIntent'
import { ticksPerTile } from '../systems/vehicle/drillRule'
import { FACING, type Facing } from '../systems/vehicle/vehiclePose'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { createRig, type Rig, type TickRead } from './cutFollowFixtures'
import { openDigSpeedWindow } from './digSpeedWindow'

export type LegSection = 'down' | 'level'

export interface FlagOffLeg {
  section: LegSection
  interval: number
  end: 'gone' | 'towed' | 'stalled'
  metres: number
  metresPerSecond: number
  cellsPerSecond: number
  lawWorkPerMetre: number
  backwardShare: number
  underHalfShare: number
  pressToFirstCutTicks: number | null
  releaseCreepMetres: number
  ticksToRest: number | null
  isTowedAfterRelease: boolean
  /** The bot's model of this rig: 60 / the band-1 cell's drill ticks (#6), cells a second. */
  botCellsPerSecond: number
}

const FRAMES_PER_SECOND = 60
const CASING_GRADE = 5
const DIVE_M = 12
const TOW_JUMP_M = 1.5
const LEG_TICKS_MAX = Math.round(300 / PHYSICS_TIMESTEP)
const SETTLE_TICKS = 6
const RELEASE_TICKS_MAX = 240
const REST_MPS = 0.05
const REST_TICKS = 6
/** One tick reads backward when it moves against the facing faster than this. */
const BACKWARD_MPS = -0.001

export function flagOffAt(interval: number): DevFlags {
  return { 'drill.sweptCut': false, 'drill.reportEveryTick': interval === 1 }
}

/** A fresh rig of `levels` plays one leg of `metres` at the cadence and lets go. */
export function playFlagOffLeg(
  rapier: typeof RAPIER,
  sink: MemorySink,
  leg: { levels: Record<string, number>; section: LegSection; interval: number; metres: number },
): FlagOffLeg {
  return withDrillExactCarry(leg.interval === 1, () => playLegAtCadence(rapier, sink, leg))
}

function playLegAtCadence(
  rapier: typeof RAPIER,
  sink: MemorySink,
  leg: { levels: Record<string, number>; section: LegSection; interval: number; metres: number },
): FlagOffLeg {
  const rig = createRig(rapier, leg.levels, FRAMES_PER_SECOND, flagOffAt(leg.interval))
  submitCommand(useGameStore.getState().playerId, setCasingGradeCommand(CASING_GRADE))
  rig.hold(buildIntent(['aim_left']), Math.round(2 / PHYSICS_TIMESTEP))
  if (leg.section === 'level') holdFor(rig, buildIntent(['aim_down']), DIVE_M)
  rig.hold(IDLE_INTENT, SETTLE_TICKS)
  const intent = buildIntent([leg.section === 'down' ? 'aim_down' : 'aim_left'])
  const botCellsPerSecond = botCellsPerSecondOf()
  const facing = leg.section === 'down' ? FACING.down : FACING.left
  const read = readLeg(rig, sink, { intent, facing }, leg.metres)
  const release = releaseOf(rig)
  return { section: leg.section, interval: leg.interval, ...read, ...release, botCellsPerSecond }
}

function botCellsPerSecondOf(): number {
  const drill = heatThrottledDrill(1, readLocalVehicle())
  const ticks = ticksPerTile(drill, blockHardness(1, 1)) ?? Infinity
  return thousandthsOf(FRAMES_PER_SECOND / ticks)
}

function readLeg(
  rig: Rig,
  sink: MemorySink,
  { intent, facing }: { intent: VehicleIntent; facing: Facing },
  metres: number,
) {
  const window = openDigSpeedWindow(sink)
  const speeds: number[] = []
  let faced: number | null = null
  let firstCut: number | null = null
  const held = holdAlong(rig, intent, metres, (read, tick) => {
    window.note(read)
    if (faced === null && read.result.pose.facing === facing) faced = tick
    if (firstCut === null && window.sums().law.ticks > 0) firstCut = tick
    if (firstCut !== null) speeds.push(read.speed)
  })
  const sums = window.sums()
  const mean = sums.metres / sums.seconds
  return {
    end: held,
    metres: thousandthsOf(sums.metres),
    metresPerSecond: thousandthsOf(mean),
    cellsPerSecond: thousandthsOf(sums.law.yieldedCells / sums.seconds),
    lawWorkPerMetre: thousandthsOf(sums.law.ticks / sums.metres),
    backwardShare: shareOf(speeds, (speed) => speed < BACKWARD_MPS),
    underHalfShare: shareOf(speeds, (speed) => speed < mean / 2),
    pressToFirstCutTicks:
      firstCut === null || faced === null ? null : Math.max(0, firstCut - faced),
  }
}

/** Holds `intent` a tick at a time until the body has gone `metres`, is towed, or stalls. */
function holdAlong(
  rig: Rig,
  intent: VehicleIntent,
  metres: number,
  each: (read: TickRead, tick: number) => void,
): FlagOffLeg['end'] {
  let last = rig.hold(intent, 1)[0]
  each(last, 1)
  let gone = 0
  for (let tick = 2; tick <= LEG_TICKS_MAX; tick++) {
    const read = rig.hold(intent, 1)[0]
    const step = Math.hypot(read.position.x - last.position.x, read.position.y - last.position.y)
    if (step > TOW_JUMP_M) return 'towed'
    each(read, tick)
    gone += step
    if (gone >= metres) return 'gone'
    last = read
  }
  return 'stalled'
}

function holdFor(rig: Rig, intent: VehicleIntent, metres: number): void {
  holdAlong(rig, intent, metres, () => undefined)
}

/**
 * Lets go: the metres it crept and the ticks until it rested (null when it never did), read until
 * a tow back to the dock.
 */
function releaseOf(rig: Rig) {
  const reads = rig.hold(IDLE_INTENT, RELEASE_TICKS_MAX)
  let creep = 0
  let still = 0
  let ticksToRest: number | null = null
  for (let tick = 1; tick < reads.length; tick++) {
    const { position } = reads[tick]
    const previous = reads[tick - 1].position
    const step = Math.hypot(position.x - previous.x, position.y - previous.y)
    if (step > TOW_JUMP_M) return releaseRead(creep, ticksToRest, true)
    creep += step
    still = Math.abs(reads[tick].speed) < REST_MPS ? still + 1 : 0
    if (still === REST_TICKS && ticksToRest === null) ticksToRest = tick - REST_TICKS + 1
  }
  return releaseRead(creep, ticksToRest, false)
}

function releaseRead(creep: number, ticksToRest: number | null, isTowed: boolean) {
  return {
    releaseCreepMetres: thousandthsOf(creep),
    ticksToRest,
    isTowedAfterRelease: isTowed,
  }
}

function shareOf(values: readonly number[], isCounted: (value: number) => boolean): number {
  if (values.length === 0) return 0
  return thousandthsOf(values.filter(isCounted).length / values.length)
}

function thousandthsOf(value: number): number {
  return Math.round(value * 1000) / 1000
}
