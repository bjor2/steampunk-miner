/**
 * The Induction Coil's pull (#142 "The extraction rigs"): the drill is grabbed and skids, but its
 * touch sets the coil on the cell; `pullTicks` later, with the cell within `rangeTiles` of the
 * vehicle and in line of sight, its ore comes out of the wall into the hold and the cell is open
 * space. One cell at a time. The opening goes through the world's terrain-edit queue (K6), as the
 * coil's tool, which `canMine` lets through on that one cell kind alone.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import { collectOreUnit } from '../../../systems/authority/groundDrill'
import { minedOreOf } from '../../../systems/authority/minedOre'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { queueTerrainEdit } from '../../../systems/authority/terrain/terrainEdits'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { AIR_DENSITY } from '../../../systems/world/sampleGrid'
import { isVehicleActive } from '../../../systems/vehicle/vehicleState'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { cellAt } from '../../../systems/world/worldState'
import { cellGateOf } from './cellGates'
import { isInLineOfSight, isTileWithinTiles } from './extractorReach'
import {
  extractorStateOf,
  withExtractorState,
  withWork,
  type ExtractorState,
  type VerbTarget,
} from './extractorState'
import { clearedEventOf } from './gateLedger'
import { VERB_ROWS } from './verbRows'
import './verbEvents'

const PULL = VERB_ROWS.pull

/** The terrain edit's source: the one tool `canMine` opens a coil cell to. */
export const PULL_TOOL = 'mining-gates.induction'

/** Ticks until the coil pulls the tile: what is left of its pull at it, else a whole pull. */
export function ticksUntilPulled(value: ExtractorState, tile: TilePoint, tick: number): number {
  const pull = value.pull
  if (pull === null || pull.tx !== tile.tx || pull.ty !== tile.ty) return PULL.pullTicks
  return Math.max(0, pull.sinceTick + PULL.pullTicks - tick)
}

/** The coil takes a touched cell when it holds none. */
export function startPull(value: ExtractorState, tile: TilePoint, tick: number): ExtractorState {
  if (value.pull !== null) return value
  const started = { ...value, pull: { tx: tile.tx, ty: tile.ty, sinceTick: tick } }
  return withWork(started, PULL.rig, { fromTick: tick, toTick: tick + PULL.pullTicks })
}

export function nextPullTick(value: ExtractorState): number | null {
  return value.pull === null ? null : value.pull.sinceTick + PULL.pullTicks
}

/** At its tick, the coil pulls a cell it still reaches, or lets go of one it does not. */
export function settlePull(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const pull = extractorStateOf(state, playerId).pull
  const params = planetParamsOf(state.planet)
  if (pull === null || params === null || tick < pull.sinceTick + PULL.pullTicks) {
    return unchanged(state)
  }
  if (!isPullHeld(state, params, playerId, pull)) return letGo(state, playerId, pull, tick)
  return pullOre(state, params, playerId, pull, tick)
}

function isPullHeld(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  tile: TilePoint,
): boolean {
  const vehicle = vehicleOf(state, playerId)
  const pose = vehicle.pose
  return (
    isVehicleActive(vehicle) &&
    pose !== null &&
    isCoilCell(state, params, tile) &&
    isTileWithinTiles(pose, tile, PULL.rangeTiles) &&
    isInLineOfSight(state, pose, tile)
  )
}

function isCoilCell(state: AuthorityState, params: PlanetParams, tile: TilePoint): boolean {
  const ore = oreTypeAtTile(state, tile)
  if (ore === null) return false
  const gate = cellGateOf(params, tile, ore)
  return gate.kind === 'rig' && gate.rig.id === PULL.rig
}

function letGo(state: AuthorityState, playerId: string, pull: VerbTarget, tick: number) {
  const broken: DomainEventBody = {
    type: 'mining-gates.PullBroken',
    playerId,
    tx: pull.tx,
    ty: pull.ty,
  }
  return { state: withPullEnded(state, playerId, pull, tick), events: [broken] }
}

/** The ore into the hold, the cell queued open, and the gate logged cleared by the extractor. */
function pullOre(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  pull: VerbTarget,
  tick: number,
): RuleEffect {
  const tile = { tx: pull.tx, ty: pull.ty }
  const ore = oreTypeAtTile(state, tile)!
  const cleared = clearedEventOf(cellGateOf(params, tile, ore), tile, ore, 'rig')
  const effect = chainEffects(state, [
    (current) =>
      collectOreUnit(
        current,
        playerId,
        minedOreOf(params, tile, cellAt(current.world, params, tile)),
      ),
    (current) => unchanged(queueTerrainEdit(current, openingOf(playerId, tile))),
    (current) => ({ state: withPullEnded(current, playerId, pull, tick), events: [cleared] }),
  ])
  return {
    state: effect.state,
    events: effect.events.map((body) => forPlayer(body, playerId, tick)),
  }
}

function openingOf(playerId: string, { tx, ty }: TilePoint) {
  return {
    playerId,
    source: PULL_TOOL,
    cells: [{ kind: 'density' as const, tx, ty, density: AIR_DENSITY }],
  }
}

function withPullEnded(
  state: AuthorityState,
  playerId: string,
  pull: VerbTarget,
  tick: number,
): AuthorityState {
  const value = extractorStateOf(state, playerId)
  const ended = withWork({ ...value, pull: null }, PULL.rig, {
    fromTick: pull.sinceTick,
    toTick: tick,
  })
  return withExtractorState(state, playerId, ended)
}

/** A clock event names the player whose hold it filled; the clock adds no command stamp. */
function forPlayer(body: DomainEventBody, playerId: string, tick: number): DomainEvent {
  return { tick, playerId, ...body }
}
