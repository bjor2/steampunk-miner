/**
 * The gate checks on the drill path (docs/standards/feature-slices.md 3.6, #142's `canMine`): for
 * ore cells only, a `refused` or `blocked` verdict makes the cell undrillable and a `lost` one
 * destroys it without cargo. Each says so in a `DrillGated` (K2): a standing cell once per drill
 * command that met it, a lost one beside its `TileDestroyed`. With no check registered the drill keeps today's
 * path exactly, so nothing here builds an ore query then.
 */
import { hasGateChecks, isStandingVerdict } from '../registries/gateChecks'
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
  /** `drillTicksOf`, answering null (not drillable) for an ore cell a gate refuses or blocks. */
  drillTicksOf: CellDrillTicks
  /** `DrillGated` for each ore cell a gate refused or blocked, in the order the drill met them. */
  refusedEvents(): DomainEventBody[]
  /** `DrillGated` for a yielded cell a gate says is lost (destroyed without cargo); else null. */
  lostEventOf(yielded: YieldedCell): DomainEventBody | null
  /**
   * #142's `canMine` for a cell the drill gear would add (ticket 234): no gate, or one that cuts
   * it. A standing cell is reported with the others; a standing or lost one is left in place.
   */
  canMine(cell: YieldedCell): boolean
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
      isStanding(gateOfCell(gates, asker, { tile, cell: material }))
        ? null
        : drillTicksOf(tile, material, casingGrade),
    refusedEvents: () => standingEventsOf(gates),
    lostEventOf: (yielded) => lostEventOf(gateOfCell(gates, asker, yielded)),
    canMine: (cell) => isCut(gateOfCell(gates, asker, cell)),
  }
}

function ungatedDrill(drillTicksOf: CellDrillTicks): DrillGates {
  return { drillTicksOf, refusedEvents: () => [], lostEventOf: () => null, canMine: () => true }
}

function isCut(gated: GatedCell | null): boolean {
  return gated === null || gated.verdict.outcome === 'cut'
}

function standingEventsOf(gates: CellGates): DomainEventBody[] {
  return [...gates.values()]
    .filter(isStanding)
    .map((gated) => drillGatedEventOf(gated, standingOutcomeOf(gated)))
}

function standingOutcomeOf(gated: GatedCell): 'refused' | 'blocked' {
  return gated.verdict.outcome === 'blocked' ? 'blocked' : 'refused'
}

function isStanding(gated: GatedCell | null): gated is GatedCell {
  return gated !== null && isStandingVerdict(gated.verdict)
}

function lostEventOf(gated: GatedCell | null): DomainEventBody | null {
  return gated?.verdict.outcome === 'lost' ? drillGatedEventOf(gated, 'lost') : null
}
