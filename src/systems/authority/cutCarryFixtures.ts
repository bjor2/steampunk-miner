/**
 * Fixtures for the report cut's charge on density removed (ticket 535, A6): the law work a change
 * of the ground removed, read from the densities before and after at the drill the vehicle had,
 * never from the ledger, and a vehicle's charge in the carry's own numerator, so a spec can hold
 * the invariant exactly: charged quanta times the denominator plus the carry equals the law work
 * removed at the swept price (`vehicle/cutCarry.ts`). Only specs use them.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../constants/devFlags'
import { cellDigEnergyOf } from './cellDigEnergy'
import { CUT_ENERGY_DENOMINATOR } from '../vehicle/cutCarry'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import type { VehicleState } from '../vehicle/vehicleState'
import type { WeightedSample } from '../world/stampShape'
import { effectiveCasingGrade } from '../world/chunkDelta'
import { casingGradeOf, densityOf, openSession } from '../world/groundEditSession'
import { SAMPLES_PER_TILE } from '../world/sampleGrid'
import { CHUNK_SIZE, type TilePoint } from '../world/tileGrid'
import { materialCellAt, type WorldState } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { DomainEvent, DomainEventBody } from './domainEvent'
import { drillSubStepsOfCells } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import { planetParamsOf } from './planetOfState'

/**
 * Runs `play` with the authority's `drill.exactCarry` as `isOn`, the flag put back after. The
 * rule tables read it from `AUTHORITY_DEV_FLAGS` at call time (`reportedDrill.ts`), so a whole
 * scripted session or replay takes the switch. It ships off (`constants/devFlags.ts`), so the
 * charge's specs and the lanes switch it on for their runs.
 */
export function withDrillExactCarry<T>(isOn: boolean, play: () => T): T {
  const flags = AUTHORITY_DEV_FLAGS as { -readonly [K in keyof AuthorityDevFlags]: boolean }
  const shipped = flags['drill.exactCarry']
  flags['drill.exactCarry'] = isOn
  try {
    return play()
  } finally {
    flags['drill.exactCarry'] = shipped
  }
}

/**
 * Runs `play` with the authority's `drill.sweptLawCharge` as `isOn` (ticket 540), put back after:
 * the swept cut reads it at call time (`sweptDrill.ts`) and it ships off.
 */
export function withSweptLawCharge<T>(isOn: boolean, play: () => T): T {
  const flags = AUTHORITY_DEV_FLAGS as { -readonly [K in keyof AuthorityDevFlags]: boolean }
  const shipped = flags['drill.sweptLawCharge']
  flags['drill.sweptLawCharge'] = isOn
  try {
    return play()
  } finally {
    flags['drill.sweptLawCharge'] = shipped
  }
}

/** The cells `events` destroyed, in order. */
export function brokenCellsOf(events: readonly (DomainEvent | DomainEventBody)[]): TilePoint[] {
  return events.flatMap((event) =>
    event.type === 'TileDestroyed' ? [{ tx: event.tx, ty: event.ty }] : [],
  )
}

/** The cells within `reach` cells of `tile`, in row order. */
export function tilesAround(tile: TilePoint, reach: number): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let ty = tile.ty - reach; ty <= tile.ty + reach; ty++) {
    for (let tx = tile.tx - reach; tx <= tile.tx + reach; tx++) tiles.push({ tx, ty })
  }
  return tiles
}

/**
 * The law work `after` shows removed over `before` on `tiles`, in density sub-steps: each
 * sample's density removed times its law time at the drill `playerId` had in `before`, at the
 * sample's own casing grade as it stood (a lined sample carves in its grade's time, #41, so a rig
 * re-cutting its own trail pays the lining's law work; breached lining is grade 0).
 */
export function lawWorkRemovedOf(
  before: AuthorityState,
  after: WorldState,
  tiles: readonly TilePoint[],
  playerId = 'p1',
): number {
  const params = planetParamsOf(before.planet)
  if (params === null) throw new Error('the state has no planet')
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(before, playerId))
  const lawTimeOf = drillSubStepsOfCells(params, drill, shockTicksFor(before, playerId))
  const was = openSession(before.world, params)
  const now = openSession(after, params)
  return tiles.reduce((sum, tile) => {
    const material = materialCellAt(before.world, params, tile)
    return (
      sum +
      samplesOfTile(tile).reduce((cell, sample) => {
        const removed = densityOf(was, sample) - densityOf(now, sample)
        if (removed <= 0) return cell
        const grade = effectiveCasingGrade(casingGradeOf(was, sample))
        return cell + removed * (lawTimeOf(tile, material, grade) ?? 0)
      }, 0)
    )
  }, 0)
}

/**
 * The law work one command removed, read from the ground on the cells its `GroundChanged` events
 * name, each sample at its casing grade as it stood before the command (ticket 540): lining a rig
 * lays behind it and then cuts again is priced at the grade it was cut at, which a reading of the
 * whole run against its start (`lawWorkRemovedOf` on the run's first state) prices at rock.
 */
export function lawWorkOfGroundChanges(
  before: AuthorityState,
  after: WorldState,
  events: readonly (DomainEvent | DomainEventBody)[],
  playerId = 'p1',
): number {
  return lawWorkRemovedOf(before, after, tilesOfGroundChanges(events), playerId)
}

/** Every cell a `GroundChanged` dirty rectangle touches, once each. */
function tilesOfGroundChanges(events: readonly (DomainEvent | DomainEventBody)[]): TilePoint[] {
  const keys = new Set<string>()
  for (const event of events) {
    if (event.type !== 'GroundChanged') continue
    const first = { tx: event.cx * CHUNK_SIZE, ty: event.cy * CHUNK_SIZE }
    for (
      let ty = Math.floor(event.y0 / SAMPLES_PER_TILE);
      ty <= Math.floor(event.y1 / SAMPLES_PER_TILE);
      ty++
    ) {
      for (
        let tx = Math.floor(event.x0 / SAMPLES_PER_TILE);
        tx <= Math.floor(event.x1 / SAMPLES_PER_TILE);
        tx++
      ) {
        keys.add(`${first.tx + tx},${first.ty + ty}`)
      }
    }
  }
  return [...keys].map((key) => {
    const [tx, ty] = key.split(',').map(Number)
    return { tx, ty }
  })
}

/** A tile's samples, in row order, at full weight. */
function samplesOfTile(tile: TilePoint): WeightedSample[] {
  const samples: WeightedSample[] = []
  for (let j = 0; j < SAMPLES_PER_TILE; j++) {
    for (let i = 0; i < SAMPLES_PER_TILE; i++) {
      samples.push({
        sx: tile.tx * SAMPLES_PER_TILE + i,
        sy: tile.ty * SAMPLES_PER_TILE + j,
        weight: 1,
        floor: 0,
      })
    }
  }
  return samples
}

/** The quanta `broken` cost at the swept cut's per-cell price (`cellDigEnergy.ts`), each rounded up once. */
export function brokenCellsEnergyOf(
  before: AuthorityState,
  broken: readonly TilePoint[],
  playerId = 'p1',
): number {
  const params = planetParamsOf(before.planet)
  if (params === null) throw new Error('the state has no planet')
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(before, playerId))
  const subStepsOf = drillSubStepsOfCells(params, drill, shockTicksFor(before, playerId))
  return broken.reduce(
    (sum, tile) =>
      sum + cellDigEnergyOf(subStepsOf(tile, materialCellAt(before.world, params, tile), 0) ?? 0),
    0,
  )
}

/** `lawWork` at the drill's whole share, in the energy carry's numerator. */
export function energyNumeratorOfLawWork(lawWork: number): number {
  return lawWork * BASIS_POINTS * ENERGY_QUANTA_PER_TICK.drill
}

/**
 * What the drill charged between two vehicle states, in the energy carry's numerator: the quanta
 * the tank lost beyond `movementQuanta`, times the denominator, plus what the carry grew by.
 */
export function cutEnergyNumeratorOf(
  before: VehicleState,
  after: VehicleState,
  movementQuanta = 0,
): number {
  const quanta = before.energy - after.energy - movementQuanta
  return quanta * CUT_ENERGY_DENOMINATOR + carryOf(after) - carryOf(before)
}

function carryOf(vehicle: VehicleState): number {
  return vehicle.cutEnergyCarry ?? 0
}
