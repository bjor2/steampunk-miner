/**
 * Fixtures for the report cut's charge on density removed (ticket 535, A6): the law work a change
 * of the ground removed, read from the densities before and after at the drill the vehicle had,
 * never from the ledger, and a vehicle's charge in the carry's own numerator, so a spec can hold
 * the invariant exactly: charged quanta times the denominator plus the carry equals the law work
 * removed at the swept price (`vehicle/cutCarry.ts`). Both sides count in the base quantum, a rig's
 * lifted quantum read back exactly (ticket 558). Only specs use them.
 */
import { BASIS_POINTS, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../constants/devFlags'
import { cellDigEnergyOf } from './cellDigEnergy'
import { CUT_ENERGY_DENOMINATOR, LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import type { VehicleState } from '../vehicle/vehicleState'
import type { CellDrillTicks } from '../world/groundEdit'
import type { WeightedSample } from '../world/stampShape'
import { effectiveCasingGrade } from '../world/chunkDelta'
import { casingGradeOf, densityOf, openSession } from '../world/groundEditSession'
import { SAMPLES_PER_TILE } from '../world/sampleGrid'
import { CHUNK_SIZE, type TilePoint } from '../world/tileGrid'
import { materialCellAt, type WorldState } from '../world/worldState'
import type { CommandIntent } from './authorityCommand'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { DomainEvent, DomainEventBody } from './domainEvent'
import { drillSubStepsOfCells } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import { planetParamsOf } from './planetOfState'
import { drillQuantumAt } from './stepBoundRead'

/**
 * Runs `play` with the authority's `drill.exactCarry` as `isOn`, the flag put back after. The
 * rules read the shipped defaults through `flagsOf` at call time (`devFlagState.ts`, ticket 547),
 * so a whole scripted session or replay with no `debug.setFlags` takes the switch. Spec support
 * only: play switches flags through the logged command.
 */
export function withDrillExactCarry<T>(isOn: boolean, play: () => T): T {
  return withAuthorityFlag('drill.exactCarry', isOn, play)
}

/**
 * Runs `play` with the authority's `drill.sweptLawCharge` as `isOn` (ticket 540), put back after:
 * the swept cut reads it at call time (`sweptDrill.ts`) and it ships off.
 */
export function withSweptLawCharge<T>(isOn: boolean, play: () => T): T {
  return withAuthorityFlag('drill.sweptLawCharge', isOn, play)
}

/**
 * Runs `play` with the authority's `drill.reportCapsule` as `isOn` (ticket 537), put back after:
 * the report's cut reads it at call time (`reportedDrill.ts`) and it ships on, so a spec that
 * reads protocol 86's bare disc switches it off for its run.
 */
export function withReportCapsule<T>(isOn: boolean, play: () => T): T {
  return withAuthorityFlag('drill.reportCapsule', isOn, play)
}

/**
 * Runs `play` with the authority's `heat.workUncapped` as `isOn` (ticket 541), put back after: the
 * heat rule reads it at call time (`heatRules.ts`, `reportedDrill.ts`) and it ships off.
 */
export function withHeatWorkUncapped<T>(isOn: boolean, play: () => T): T {
  return withAuthorityFlag('heat.workUncapped', isOn, play)
}

function withAuthorityFlag<T>(name: keyof AuthorityDevFlags, isOn: boolean, play: () => T): T {
  const flags = AUTHORITY_DEV_FLAGS as { -readonly [K in keyof AuthorityDevFlags]: boolean }
  const shipped = flags[name]
  flags[name] = isOn
  try {
    return play()
  } finally {
    flags[name] = shipped
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
 * The law work `after` shows removed over `before` on `tiles`, in density sub-steps of the base
 * quantum: each sample's density removed times its law time at the drill `playerId` had in
 * `before`, at the sample's own casing grade as it stood (a lined sample carves in its grade's
 * time, #41, so a rig re-cutting its own trail pays the lining's law work; breached lining is grade
 * 0). The law time is read in `quantum` sub-steps a tick, the clock that cut (the base for a
 * report's cut, the rig's drill quantum for the swept cut, ticket 558), and counted back in base
 * sub-steps: the quanta are the base doubled, so the fraction is exact in a double.
 */
export function lawWorkRemovedOf(
  before: AuthorityState,
  after: WorldState,
  tiles: readonly TilePoint[],
  playerId = 'p1',
  quantum = DRILL_SUBSTEPS_PER_TICK,
): number {
  const params = planetParamsOf(before.planet)
  if (params === null) throw new Error('the state has no planet')
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(before, playerId))
  const lawTimeOf = baseLawTimesOf(
    drillSubStepsOfCells(params, drill, shockTicksFor(before, playerId), quantum),
    quantum,
  )
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
 * The quantum a command's cut counts its law time in: the rig's drill quantum for a drill step
 * (ticket 558), the base for every other command.
 */
export function lawQuantumOfCommand(
  state: AuthorityState,
  command: CommandIntent,
  playerId = 'p1',
): number {
  return command.type === 'drillStep' ? drillQuantumAt(state, playerId) : DRILL_SUBSTEPS_PER_TICK
}

/**
 * Law times in sub-steps of `quantum`, read in base sub-steps: exact, `quantum` being the base
 * doubled (ticket 558).
 */
function baseLawTimesOf(lawTimeOf: CellDrillTicks, quantum: number): CellDrillTicks {
  if (quantum === DRILL_SUBSTEPS_PER_TICK) return lawTimeOf
  const scale = quantum / DRILL_SUBSTEPS_PER_TICK
  return (tile, material, grade) => {
    const time = lawTimeOf(tile, material, grade)
    return time === null ? null : time / scale
  }
}

/**
 * The law work one command removed, read from the ground on the cells its `GroundChanged` events
 * name, each sample at its casing grade as it stood before the command (ticket 540): lining a rig
 * lays behind it and then cuts again is priced at the grade it was cut at, which a reading of the
 * whole run against its start (`lawWorkRemovedOf` on the run's first state) prices at rock. Law
 * times in `quantum`, the clock that cut (ticket 558).
 */
export function lawWorkOfGroundChanges(
  before: AuthorityState,
  after: WorldState,
  events: readonly (DomainEvent | DomainEventBody)[],
  playerId = 'p1',
  quantum = DRILL_SUBSTEPS_PER_TICK,
): number {
  return lawWorkRemovedOf(before, after, tilesOfGroundChanges(events), playerId, quantum)
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

/**
 * The quanta `broken` cost at the swept cut's per-cell price (`cellDigEnergy.ts`), each rounded up
 * once, in the drill quantum the rig had in `before` (ticket 558).
 */
export function brokenCellsEnergyOf(
  before: AuthorityState,
  broken: readonly TilePoint[],
  playerId = 'p1',
): number {
  const params = planetParamsOf(before.planet)
  if (params === null) throw new Error('the state has no planet')
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(before, playerId))
  const quantum = drillQuantumAt(before, playerId)
  const subStepsOf = drillSubStepsOfCells(params, drill, shockTicksFor(before, playerId), quantum)
  const subStepsAt = (tile: TilePoint) =>
    subStepsOf(tile, materialCellAt(before.world, params, tile), 0) ?? 0
  return broken.reduce(
    (sum, tile) => sum + cellDigEnergyOf(subStepsAt(tile), BASIS_POINTS, quantum),
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
  return quanta * CUT_ENERGY_DENOMINATOR + baseEnergyCarryOf(after) - baseEnergyCarryOf(before)
}

/**
 * The whole drill ticks a charged report heated for, read from the vehicle: the law work its
 * charge shows tallied (the energy numerator at the drill's whole share) plus the heat carry's
 * fall, over a drill tick's law work. Exact: an integer by `cutCarry.ts`.
 */
export function chargedHeatTicksOf(
  before: VehicleState,
  after: VehicleState,
  movementQuanta = 0,
): number {
  const law = cutEnergyNumeratorOf(before, after, movementQuanta) / energyNumeratorOfLawWork(1)
  const heated = (before.cutHeatCarry ?? 0) + law - (after.cutHeatCarry ?? 0)
  return Math.round(heated / LAW_WORK_PER_DRILL_TICK)
}

/** The energy carry in base-quantum units: exact, its quantum being the base doubled (ticket 558). */
export function baseEnergyCarryOf(vehicle: VehicleState): number {
  const quantum = vehicle.cutEnergyCarryQuantum ?? DRILL_SUBSTEPS_PER_TICK
  return ((vehicle.cutEnergyCarry ?? 0) * DRILL_SUBSTEPS_PER_TICK) / quantum
}
