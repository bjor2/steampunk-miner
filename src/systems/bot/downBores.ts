/**
 * The bot's bores down (Bjor's ruling on #724): a cut down gains speed no faster than local
 * gravity, `a = max(g(r), 0.1 g_surface)` (`radialGravity.ts`), up to the drill's speed, and slows
 * at once. On the scripted clock a down tile therefore takes the longer of the drill's time and the
 * time a body entering at the leg's speed needs to ramp across its metre: the drill bores for its
 * own time, so it heats and draws for its work alone, and the bot stands by for the rest. The speed a bore leaves
 * carries into a bore of the tile below that starts on the tick it ended, as the bore clock's carry
 * does (ticket 559); anything else starts the next leg from rest.
 *
 * Each planet keeps its down-bore metres, ticks and the ticks the ramp added, so `balance:report`
 * prints the effective down speed (leg distance over leg time) per planet
 * (`logging/downSpeedReport.ts`).
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { TilePoint } from '../world/tileGrid'
import type { TileBore } from './boreClock'

/** The speed a bore down left the body at, in m/s, on the tick it ended, in the tile it opened. */
export interface DownLeg {
  tick: number
  tile: TilePoint
  speed: number
}

/** A down bore on the scripted clock, and the speed it leaves the body at. */
export interface RampedBore {
  bore: TileBore
  exitSpeed: number
}

/** One planet's bores down. */
export interface DownBorePlanet {
  planet: number
  metres: number
  boreTicks: number
  /** Ticks the gravity ramp added over the drill's own time. */
  gravityBoundTicks: number
}

/** Every planet's bores down in one run, by planet index. */
export type DownBoreTally = Map<number, DownBorePlanet>

const CELL_METRES = 1

export function newDownBoreTally(): DownBoreTally {
  return new Map()
}

/** The speed a bore of `tile` starting at `tick` enters with: the leg's, or 0 on a new leg. */
export function entrySpeedOf(leg: DownLeg | undefined, from: TilePoint, tick: number): number {
  if (leg === undefined || leg.tick !== tick) return 0
  return leg.tile.tx === from.tx && leg.tile.ty === from.ty ? leg.speed : 0
}

/**
 * The bore down of one tile entered at `entrySpeed` m/s under `acceleration` m/s²: at least the
 * drill's sub-steps, and as many as the ramp needs across the metre where that is longer.
 */
export function rampedDownBoreOf(
  bore: TileBore,
  entrySpeed: number,
  acceleration: number,
): RampedBore {
  const topSpeed = topSpeedOf(bore)
  const cell = rampedCellOf(entrySpeed, topSpeed, acceleration)
  const rampSubSteps = Math.ceil(cell.seconds * TICKS_PER_SECOND * bore.quantum)
  return {
    bore: { ...bore, subSteps: Math.max(bore.subSteps, rampSubSteps) },
    exitSpeed: cell.exitSpeed,
  }
}

/**
 * Whole ticks still to stand by once the drill has bored the tile in `elapsedTicks`: what the ramp
 * takes across it beyond the drill's own time or the time spent, whichever is longer, never below
 * 0. The drill heats and draws for its work alone; the body is still gaining speed (#724). A cell
 * an earlier cut took some of opens before the drill's ticks are spent, and owes the ramp's ticks
 * over the drill's, not the drill's unspent ones.
 */
export function rampRestTicksOf(
  rampedBore: TileBore,
  drillBore: TileBore,
  elapsedTicks: number,
): number {
  const spentTicks = Math.max(elapsedTicks, wholeTicksOf(drillBore))
  return Math.max(0, wholeTicksOf(rampedBore) - spentTicks)
}

/** Counts a bore down on `planet`: its metre, its ticks and the ticks the ramp added. */
export function tallyDownBore(
  tally: DownBoreTally,
  planet: number,
  drillBore: TileBore,
  rampedBore: TileBore,
): void {
  const record = planetRecordOf(tally, planet)
  record.metres += CELL_METRES
  record.boreTicks += rampedBore.subSteps / rampedBore.quantum
  record.gravityBoundTicks += (rampedBore.subSteps - drillBore.subSteps) / rampedBore.quantum
}

/** m/s down the planet's legs: metres bored down over the seconds they took; 0 with none. */
export function effectiveDownSpeedOf(record: DownBorePlanet): number {
  return record.boreTicks === 0 ? 0 : (record.metres * TICKS_PER_SECOND) / record.boreTicks
}

/** The share of the planet's down-bore ticks the ramp added, 0 to 1; 0 with none. */
export function gravityBoundShareOf(record: DownBorePlanet): number {
  return record.boreTicks === 0 ? 0 : record.gravityBoundTicks / record.boreTicks
}

function wholeTicksOf(bore: TileBore): number {
  return Math.ceil(bore.subSteps / bore.quantum)
}

/** m/s the drill alone cuts the tile's metre at. */
function topSpeedOf(bore: TileBore): number {
  return (CELL_METRES * TICKS_PER_SECOND * bore.quantum) / bore.subSteps
}

interface RampedCell {
  seconds: number
  exitSpeed: number
}

/** One metre from `entrySpeed` toward `topSpeed` at `acceleration`, slowing to it at once. */
function rampedCellOf(entrySpeed: number, topSpeed: number, acceleration: number): RampedCell {
  if (entrySpeed >= topSpeed) return { seconds: CELL_METRES / topSpeed, exitSpeed: topSpeed }
  const rampSeconds = (topSpeed - entrySpeed) / acceleration
  const rampMetres = ((entrySpeed + topSpeed) / 2) * rampSeconds
  if (rampMetres >= CELL_METRES) return cellWithinRampOf(entrySpeed, acceleration)
  return {
    seconds: rampSeconds + (CELL_METRES - rampMetres) / topSpeed,
    exitSpeed: topSpeed,
  }
}

/** The metre still ramping at its end: `d = v0 t + a t² / 2` solved for `t`. */
function cellWithinRampOf(entrySpeed: number, acceleration: number): RampedCell {
  const exitSpeed = Math.sqrt(entrySpeed * entrySpeed + 2 * acceleration * CELL_METRES)
  return { seconds: (exitSpeed - entrySpeed) / acceleration, exitSpeed }
}

function planetRecordOf(tally: DownBoreTally, planet: number): DownBorePlanet {
  const known = tally.get(planet)
  if (known !== undefined) return known
  const fresh = { planet, metres: 0, boreTicks: 0, gravityBoundTicks: 0 }
  tally.set(planet, fresh)
  return fresh
}
