/**
 * `DrillGated` once per gated cell on the reported drill (ticket 519, the TD ruling 6225185887 on
 * #519, part A2 of the #514 split). A pose report's drill asks the gates about every cell its disc
 * and each gear head's own reach meet, and says so for each standing one. Held against a gate, the
 * same cell would repeat on every report, so the vehicle keeps the standing cells the last report
 * met (`vehicle/gatedBite.ts`) and the next report leaves out the ones already in that bite.
 *
 * A cell is left out only while the bite runs on unbroken: the bite was written by the report the
 * vehicle was last charged at, and the drill ran every tick since. Anything else (a drill-off
 * interval, a cell newly under the bit, a scripted drill in between) raises it again, so the first
 * meeting of a cell always fires its chip, codex contact and extractor pull. A report whose drill
 * the swept cut's steps cut meets nothing here (the steps leave out their own repeats). The gate
 * stays a hard stop: the bite only filters the report's own events, never the cut or its charge. A
 * report that meets no standing cell, a mode change and a new planet end the bite.
 */
import { gatedBiteOf, keyOfBiteCell, withoutGatedBite } from '../vehicle/gatedBite'
import type { VehicleState } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'

/** The report a drill effect came from: its tick and the drill ticks it said it ran. */
export interface BiteReport {
  tick: number
  drillTicks: number
}

type StandingGate = Extract<DomainEventBody, { type: 'DrillGated' }>

/**
 * The report's drill effect with the standing `DrillGated` the bite already raised left out, and
 * the vehicle's bite moved to the cells this report met; `before` is the vehicle before the drill.
 */
export function followGatedBite(
  drilled: RuleEffect,
  playerId: string,
  before: VehicleState,
  report: BiteReport,
): RuleEffect {
  const held = heldBiteCellsOf(before, report)
  return {
    state: withBiteOf(drilled.state, playerId, metStandingCellsOf(drilled.events), report.tick),
    events: withoutHeldGates(drilled.events, held),
  }
}

/** A mode change ends the bite: a strand, a wreck, a tow or a dock is never mid-bite. */
export function endGatedBite(state: AuthorityState, playerId: string): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.gatedBite === undefined) return unchanged(state)
  return unchanged(withVehicle(state, playerId, withoutGatedBite(vehicle)))
}

/** The bite's cells while it runs on into this report; none when in doubt. */
function heldBiteCellsOf(vehicle: VehicleState, report: BiteReport): ReadonlySet<string> {
  const bite = vehicle.gatedBite
  if (bite === undefined || !isBiteRunningOn(bite.tick, vehicle.accountedTick, report)) {
    return new Set()
  }
  return new Set(bite.cells.map(keyOfBiteCell))
}

/** Written at the last charged report, and the drill ran every tick since. */
function isBiteRunningOn(biteTick: number, accountedTick: number, report: BiteReport): boolean {
  const interval = report.tick - accountedTick
  return biteTick === accountedTick && interval > 0 && report.drillTicks === interval
}

function metStandingCellsOf(events: readonly DomainEventBody[]): TilePoint[] {
  return events.filter(isStandingGate).map(({ tx, ty }) => ({ tx, ty }))
}

function withoutHeldGates(
  events: readonly DomainEventBody[],
  held: ReadonlySet<string>,
): DomainEventBody[] {
  return events.filter((event) => !isStandingGate(event) || !held.has(keyOfBiteCell(event)))
}

function withBiteOf(
  state: AuthorityState,
  playerId: string,
  cells: readonly TilePoint[],
  tick: number,
): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  if (cells.length > 0) {
    return withVehicle(state, playerId, { ...vehicle, gatedBite: gatedBiteOf(tick, cells) })
  }
  return endGatedBite(state, playerId).state
}

/** A refused or blocked cell; a lost one is destroyed, so it never stands under the bit again. */
function isStandingGate(event: DomainEventBody): event is StandingGate {
  return event.type === 'DrillGated' && event.outcome !== 'lost'
}
