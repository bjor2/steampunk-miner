/**
 * One drill tick's aggregate for #335's `drill_cut` run-log line (the TD lock on #374, item 6):
 * the cells the cut broke, the value that reached the hold and the ore cells per ore id, plus the
 * tick's dig time, read from the tick's one pass. It writes nothing: `TileDestroyed` and
 * `CargoAdded` stay per cell, and #335 owns the line and when it is written.
 *
 * Dig time is each broken cell's own drill time at the drill's hardness and scratch floor, with an
 * electrified cell's shock unless a shield covers it, summed in sub-steps of a tick
 * (`DRILL_SUBSTEPS_PER_TICK`, doubled for a fast rig: its drill quantum, ticket 558), so a change
 * of band or depth inside a span is priced per cell. It
 * prices heat once #335 flips the flag; it never prices energy or holds motion back.
 */
import { add, fromCanonical, ZERO_MONEY, type Money } from '../money'
import type { YieldedCell } from '../world/cellYield'
import type { PlanetParams } from '../world/planetParams'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { DomainEventBody } from './domainEvent'
import type { DrillCarve } from './drillGearCut'
import { drillSubStepsOfCells, type DrillOutcome } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import { minedOreOf } from './minedOre'
import { drillQuantumAt } from './stepBoundRead'

export interface DrillCutTally {
  /** Cells the tick's cut broke, of every kind. */
  cells: number
  /** The sale value of the units that reached the hold. */
  value: Money
  /** Ore cells the cut broke per ore id, with the units a full hold or a gate lost. */
  ores: Record<string, number>
  /** The broken cells' own drill times, summed in sub-steps of the rig's drill quantum. */
  digSubSteps: number
}

/** The tally of a drill tick cut from `before`, from its carve and the events it answered. */
export function drillCutTallyOf(
  before: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { effect, carved }: DrillOutcome<DrillCarve>,
): DrillCutTally {
  const broken = carved?.yielded ?? []
  return {
    cells: broken.length,
    value: cargoValueOf(effect.events),
    ores: oreCountsOf(params, broken),
    digSubSteps: digSubStepsOfCells(before, params, playerId, {
      yielded: broken,
      quantum: drillQuantumAt(before, playerId),
    }),
  }
}

function cargoValueOf(events: readonly DomainEventBody[]): Money {
  return events.reduce(
    (sum, event) => (event.type === 'CargoAdded' ? add(sum, fromCanonical(event.value)) : sum),
    ZERO_MONEY,
  )
}

function oreCountsOf(params: PlanetParams, broken: readonly YieldedCell[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const { tile, cell } of broken.filter((yielded) => isOreCell(yielded.cell))) {
    const { oreId } = minedOreOf(params, tile, cell)
    counts[oreId] = (counts[oreId] ?? 0) + 1
  }
  return counts
}

function isOreCell(cell: number): boolean {
  return kindOfCell(cell) === CELL_KIND.ore
}

/** Cells a tick broke, and the drill quantum their times count in. */
export interface BrokenCells {
  yielded: readonly YieldedCell[]
  quantum: number
}

/** The broken cells' own drill times from `before`, summed in sub-steps of their quantum. */
export function digSubStepsOfCells(
  before: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { yielded, quantum }: BrokenCells,
): number {
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(before, playerId))
  const subStepsOf = drillSubStepsOfCells(params, drill, shockTicksFor(before, playerId), quantum)
  return yielded.reduce((sum, { tile, cell }) => sum + (subStepsOf(tile, cell, 0) ?? 0), 0)
}
