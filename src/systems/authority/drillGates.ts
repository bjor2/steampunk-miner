/**
 * The gate checks on the drill path (docs/standards/feature-slices.md 3.6, #142's `canMine`): for
 * ore cells only, a `refused` verdict makes the cell undrillable and a `lost` one destroys it
 * without cargo. Each says so in a `DrillGated` (K2): a refused cell once per drill command that
 * met it, a lost one beside its `TileDestroyed`. With no check registered the drill keeps today's
 * path exactly, so nothing here builds an ore query then.
 */
import { hasGateChecks } from '../registries/gateChecks'
import type { YieldedCell } from '../world/cellYield'
import type { CellDrillTicks } from '../world/groundEdit'
import type { PlanetParams } from '../world/planetParams'
import type { AuthorityState } from './authorityState'
import {
  drillGatedEventOf,
  gateOfCell,
  type CellGates,
  type GateAsker,
  type GatedCell,
} from './cellGates'
import type { DomainEventBody } from './domainEvent'

/** The gates of one drill command. */
export interface DrillGates {
  /** `drillTicksOf`, answering null (not drillable) for an ore cell a gate refuses. */
  drillTicksOf: CellDrillTicks
  /** `DrillGated` for each ore cell a gate refused, in the order the drill met them. */
  refusedEvents(): DomainEventBody[]
  /** `DrillGated` for a yielded cell a gate says is lost (destroyed without cargo); else null. */
  lostEventOf(yielded: YieldedCell): DomainEventBody | null
}

export function openDrillGates(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  drillTicksOf: CellDrillTicks,
): DrillGates {
  if (!hasGateChecks()) return ungatedDrill(drillTicksOf)
  const asker: GateAsker = { state, playerId, params, blast: null }
  const gates: CellGates = new Map()
  return {
    drillTicksOf: (tile, material, casingGrade) =>
      gateOfCell(gates, asker, { tile, cell: material })?.verdict.outcome === 'refused'
        ? null
        : drillTicksOf(tile, material, casingGrade),
    refusedEvents: () => refusedEventsOf(gates),
    lostEventOf: (yielded) => lostEventOf(gateOfCell(gates, asker, yielded)),
  }
}

function ungatedDrill(drillTicksOf: CellDrillTicks): DrillGates {
  return { drillTicksOf, refusedEvents: () => [], lostEventOf: () => null }
}

function refusedEventsOf(gates: CellGates): DomainEventBody[] {
  return [...gates.values()].filter(isRefused).map((gated) => drillGatedEventOf(gated, 'refused'))
}

function isRefused(gated: GatedCell | null): gated is GatedCell {
  return gated?.verdict.outcome === 'refused'
}

function lostEventOf(gated: GatedCell | null): DomainEventBody | null {
  return gated?.verdict.outcome === 'lost' ? drillGatedEventOf(gated, 'lost') : null
}
