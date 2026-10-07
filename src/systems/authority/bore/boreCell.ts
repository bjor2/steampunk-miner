/**
 * Opening one cell of a bore (ticket 313, Systems' budget and the TD's point 3 on #309): the
 * cell is cut by the drill's own carve, through the shared dig function at `gunFactor ×
 * drillPower` and the drill's gates, so the gun can never open a cell the drill could not.
 *
 * - An open cell costs nothing and lets the line pass.
 * - The line stops, with the clank, at lava, the core, or a cell the drill cannot dig (its
 *   scratch floor, a gate that refuses or blocks it, the dock pad), and stops quietly where the
 *   shot's dig budget or the tank runs out. Nothing past a stop opens.
 * - A cell opens whole or not at all: it spends the dig ticks it took from the budget, and its
 *   energy is the drill's own dig energy for it times the shot's energy share (never below it).
 * - Its ore yields like a drilled cell (`TileDestroyed`, `cause: 'bore'`) but nothing reaches the
 *   hold: bored ore lies loose, so re-digging the cell after a refill never pays it again.
 */
import { div, fromSafeInteger, mul } from '../../money'
import type { DrillStats } from '../../vehicle/drillRule'
import { ENERGY_QUANTA_PER_TICK } from '../../vehicle/energyQuanta'
import { cellDensitySum, type YieldedCell } from '../../world/cellYield'
import { carveCell, type Carve, type CellDrillTicks } from '../../world/groundEdit'
import { isLavaAt } from '../../world/lavaFlow'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { materialCellAt } from '../../world/worldState'
import { WHOLE_BP } from '../../registries/boreGun'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import type { RuleEffect } from '../commandRule'
import type { BoreStop, DomainEventBody } from '../domainEvent'
import { openDrillGates, type DrillGates } from '../drillGates'
import { groundChangedEventsOf } from '../groundChangedEvents'
import { casingDrilledEvents, drillTicksOfCells, kindNameOf } from '../groundDrill'
import { heatThrottledDrill } from '../heatRules'
import { wakeLavaBeside } from '../lava/lavaRules'
import { shockTicksFor } from '../magnetic/electrifiedShock'
import type { BoreShot } from './boreState'

export type CellOpening =
  | { kind: 'passed' }
  | { kind: 'opened'; effect: RuleEffect; ticks: number }
  | { kind: 'stopped'; stop: BoreStop; events: DomainEventBody[] }

/** What one cell of a bore asks: whose gun, the shot's numbers, and the budget left. */
export interface BoreCellAsk {
  playerId: string
  /** The tick the cell opens: when the pockets beside it come loose. */
  tick: number
  shot: BoreShot
  budgetLeft: number
  tile: TilePoint
}

const BP = fromSafeInteger(WHOLE_BP)

export function openBoreCell(
  state: AuthorityState,
  params: PlanetParams,
  ask: BoreCellAsk,
): CellOpening {
  const blocker = blockerAt(state, params, ask.tile)
  if (blocker !== null) return blocker
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(state, ask.playerId))
  const gates = openDrillGates(
    state,
    ask.playerId,
    params,
    gunTicksOfCells(state, params, drill, ask),
  )
  return cutCell(state, params, ask, drill, gates)
}

/** The energy a bored cell costs: `ceil(drill ticks × drill quanta × share)`, in quanta. */
export function boreCellEnergy(drillTicks: number, energyPerCellBp: number): number {
  return Math.ceil((drillTicks * ENERGY_QUANTA_PER_TICK.drill * energyPerCellBp) / WHOLE_BP)
}

/** Lava, an open cell or the core: the cell is settled before any dig is asked. */
function blockerAt(
  state: AuthorityState,
  params: PlanetParams,
  tile: TilePoint,
): CellOpening | null {
  if (isLavaAt(state.world, params, tile)) return stoppedBy('lava')
  if (cellDensitySum(state.world, params, tile) === 0) return { kind: 'passed' }
  const material = materialCellAt(state.world, params, tile)
  return kindOfCell(material) === CELL_KIND.core ? stoppedBy('core') : null
}

function cutCell(
  state: AuthorityState,
  params: PlanetParams,
  ask: BoreCellAsk,
  drill: DrillStats,
  gates: DrillGates,
): CellOpening {
  const material = materialCellAt(state.world, params, ask.tile)
  if (gates.drillTicksOf(ask.tile, material, 0) === null) {
    return { kind: 'stopped', stop: 'refused', events: gates.refusedEvents() }
  }
  const cut = carveWithin(state, params, ask, gates.drillTicksOf)
  if (!isCellOpen(cut, params, ask.tile)) return stoppedBy(unopenedStopOf(cut, ask.budgetLeft))
  const energy = drillEnergyOf(state, params, ask, drill)
  if (vehicleOf(state, ask.playerId).energy < energy) return stoppedBy('energy')
  return {
    kind: 'opened',
    effect: boredEffectOf(state, params, ask, cut, gates, energy),
    ticks: cut.ticksUsed,
  }
}

/**
 * The shared dig function at `gunFactor × drillPower`; the tip, its gate and the shock ticks an
 * electrified cell adds stay the drill's (the shock's hull cost is the drill's alone).
 */
function gunTicksOfCells(
  state: AuthorityState,
  params: PlanetParams,
  drill: DrillStats,
  ask: BoreCellAsk,
): CellDrillTicks {
  const drillPower = div(mul(drill.drillPower, fromSafeInteger(ask.shot.gunFactorBp)), BP)
  return drillTicksOfCells(params, { ...drill, drillPower }, shockTicksFor(state, ask.playerId))
}

/** The cell's samples cut for at most the budget left, as the drill's carve cuts them. */
function carveWithin(
  state: AuthorityState,
  params: PlanetParams,
  ask: BoreCellAsk,
  drillTicksOf: CellDrillTicks,
): Carve {
  const window = { firstTick: 0, ticks: ask.budgetLeft }
  return carveCell(state.world, params, ask.tile, window, drillTicksOf)
}

function isCellOpen(cut: Carve, params: PlanetParams, tile: TilePoint): boolean {
  return cellDensitySum(cut.world, params, tile) === 0
}

/** A cut that stopped short of the budget met a sample nothing can carve; else the budget ran out. */
function unopenedStopOf(cut: Carve, budgetLeft: number): BoreStop {
  return cut.ticksUsed < budgetLeft ? 'refused' : 'budget'
}

/**
 * The drill's own dig energy for the cell, at its own power, times the shot's share. The drill is
 * never slower than the gun (`gunFactor` is at most 1), so it clears the cell in the same window.
 */
function drillEnergyOf(
  state: AuthorityState,
  params: PlanetParams,
  ask: BoreCellAsk,
  drill: DrillStats,
): number {
  const drilled = carveWithin(
    state,
    params,
    ask,
    drillTicksOfCells(params, drill, shockTicksFor(state, ask.playerId)),
  )
  return boreCellEnergy(drilled.ticksUsed, ask.shot.energyPerCellBp)
}

function boredEffectOf(
  state: AuthorityState,
  params: PlanetParams,
  ask: BoreCellAsk,
  cut: Carve,
  gates: DrillGates,
  energy: number,
): RuleEffect {
  const vehicle = vehicleOf(state, ask.playerId)
  const paid = withVehicle({ ...state, world: cut.world }, ask.playerId, {
    ...vehicle,
    energy: vehicle.energy - energy,
  })
  return {
    state: wakeLavaBeside(paid, params, cut.yielded, ask.tick),
    events: [
      ...groundChangedEventsOf(cut),
      ...casingDrilledEvents(cut),
      ...cut.yielded.flatMap((yielded) => boredTileEvents(yielded, gates)),
    ],
  }
}

/** The cell's yield, and a gate's word when it says the ore is lost. */
function boredTileEvents(yielded: YieldedCell, gates: DrillGates): DomainEventBody[] {
  const destroyed: DomainEventBody = {
    type: 'TileDestroyed',
    ...yielded.tile,
    kind: kindNameOf(yielded.cell),
    cause: 'bore',
  }
  const lost = gates.lostEventOf(yielded)
  return lost === null ? [destroyed] : [destroyed, lost]
}

function stoppedBy(stop: BoreStop): CellOpening {
  return { kind: 'stopped', stop, events: [] }
}
