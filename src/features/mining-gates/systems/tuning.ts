/**
 * The Resonance Fork's tune (#142 "The extraction rigs"): the drill touching a resonance cell
 * starts the fork singing at it; held within `rangeTiles` and under `maxSpeedMmPerSecond` for
 * `tuneTicks`, the cell and its connected cells of the same ore ring and stay drillable for
 * `tunedHoldTicks`. Moving off breaks the tune, watched every tick like a power-up's channel.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEventBody } from '../../../systems/authority/domainEvent'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { isVehicleActive } from '../../../systems/vehicle/vehicleState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { isSlowerThan, isSolidTile, isTileWithinTiles } from './extractorReach'
import {
  extractorStateOf,
  withExtractorState,
  withWork,
  type ExtractorState,
  type TunedPatch,
} from './extractorState'
import { VERB_ROWS } from './verbRows'
import './verbEvents'

const TUNE = VERB_ROWS.tune

/** Whether a tuned patch still ringing at `tick` holds the tile. */
export function isTunedAt(value: ExtractorState, tile: TilePoint, tick: number): boolean {
  return value.tuned.some((patch) => patch.untilTick > tick && hasTile(patch.cells, tile))
}

/** Ticks until the tile rings: what is left of a tune at it, else a whole tune. */
export function ticksUntilTuned(value: ExtractorState, tile: TilePoint, tick: number): number {
  const tuning = value.tuning
  if (tuning === null || !isSameTile(tuning, tile)) return TUNE.tuneTicks
  return Math.max(0, tuning.sinceTick + TUNE.tuneTicks - tick)
}

/** The fork starts on a touched cell, unless it already sings at it. */
export function startTuning(value: ExtractorState, tile: TilePoint, tick: number): ExtractorState {
  if (value.tuning !== null && isSameTile(value.tuning, tile)) return value
  const started = { ...value, tuning: { ...tile, sinceTick: tick } }
  return withWork(started, TUNE.rig, { fromTick: tick, toTick: tick + TUNE.tuneTicks })
}

/** A tune in progress is watched every tick. */
export function nextTuningTick(value: ExtractorState, tick: number): number | null {
  return value.tuning === null ? null : tick + 1
}

/** Breaks a tune the vehicle moved off, rings a finished one, and leaves one under way. */
export function settleTuning(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const tuning = extractorStateOf(state, playerId).tuning
  if (tuning === null) return unchanged(state)
  if (!isTuneHeld(state, playerId, tuning)) return breakTuning(state, playerId, tuning, tick)
  if (tick < tuning.sinceTick + TUNE.tuneTicks) return unchanged(state)
  return ringPatch(state, playerId, tuning, tick)
}

function isTuneHeld(state: AuthorityState, playerId: string, tile: TilePoint): boolean {
  const vehicle = vehicleOf(state, playerId)
  const pose = vehicle.pose
  return (
    isVehicleActive(vehicle) &&
    pose !== null &&
    isTileWithinTiles(pose, tile, TUNE.rangeTiles) &&
    isSlowerThan(pose, TUNE.maxSpeedMmPerSecond) &&
    isSolidTile(state, tile)
  )
}

function breakTuning(
  state: AuthorityState,
  playerId: string,
  tile: TilePoint,
  tick: number,
): RuleEffect {
  const value = extractorStateOf(state, playerId)
  const quiet = withWork({ ...value, tuning: null }, TUNE.rig, workEndedAt(value, tick))
  const broken: DomainEventBody = { type: 'mining-gates.TuneBroken', playerId, ...tileOf(tile) }
  return { state: withExtractorState(state, playerId, quiet), events: [broken] }
}

function ringPatch(
  state: AuthorityState,
  playerId: string,
  tile: TilePoint,
  tick: number,
): RuleEffect {
  const value = extractorStateOf(state, playerId)
  const patch = { cells: connectedOreCells(state, tile), untilTick: tick + TUNE.tunedHoldTicks }
  const tuned = [...value.tuned.filter((kept) => kept.untilTick > tick), patch]
  const rung = withWork({ ...value, tuning: null, tuned }, TUNE.rig, workEndedAt(value, tick))
  return {
    state: withExtractorState(state, playerId, rung),
    events: [tunedEventOf(playerId, tile, patch)],
  }
}

function tunedEventOf(playerId: string, tile: TilePoint, patch: TunedPatch): DomainEventBody {
  return {
    type: 'mining-gates.OreTuned',
    playerId,
    ...tileOf(tile),
    cells: patch.cells.length,
    untilTick: patch.untilTick,
  }
}

/** The work span closed at `tick`, opened where the tune began. */
function workEndedAt(value: ExtractorState, tick: number) {
  return { fromTick: value.tuning?.sinceTick ?? tick, toTick: tick }
}

/**
 * The solid cells of the touched cell's ore joined to it side by side, breadth first in a fixed
 * neighbour order, at most `maxTunedCells`, so every machine rings the same patch.
 */
export function connectedOreCells(state: AuthorityState, from: TilePoint): TilePoint[] {
  const oreId = oreTypeAtTile(state, from)?.id
  if (oreId === undefined) return []
  const found: TilePoint[] = [tileOf(from)]
  for (let at = 0; at < found.length && found.length < TUNE.maxTunedCells; at++) {
    const joined = sidesOf(found[at]).filter(
      (side) => !hasTile(found, side) && isSameOreSolid(state, side, oreId),
    )
    found.push(...joined.slice(0, TUNE.maxTunedCells - found.length))
  }
  return found
}

function isSameOreSolid(state: AuthorityState, tile: TilePoint, oreId: string): boolean {
  return oreTypeAtTile(state, tile)?.id === oreId && isSolidTile(state, tile)
}

function sidesOf({ tx, ty }: TilePoint): TilePoint[] {
  return [
    { tx: tx + 1, ty },
    { tx: tx - 1, ty },
    { tx, ty: ty + 1 },
    { tx, ty: ty - 1 },
  ]
}

function hasTile(cells: readonly TilePoint[], tile: TilePoint): boolean {
  return cells.some((cell) => isSameTile(cell, tile))
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}

function tileOf({ tx, ty }: TilePoint): TilePoint {
  return { tx, ty }
}
