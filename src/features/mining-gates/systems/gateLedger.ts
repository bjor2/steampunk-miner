/**
 * The gate ledger (#142 acceptance 13, ticket 236), the slice's authority reaction: it hears every
 * ore cell a command or a tick destroyed, reads the cell's gate on the state before, and records a
 * gated one as `GateCleared` (freed: by the tip, by the drill with its extractor, by a charge) or,
 * when the drill's gate said it was lost, `GateOreLost`. An ungated cell records nothing, and the
 * ledger keeps no state, so a run with no gated cell reads exactly as before.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { toCanonical } from '../../../systems/money'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { saleTierOf, type OreType } from '../../../systems/registries/oreTypes'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { cellGateOf } from './cellGates'
import type { ClearMethod, GateKindName } from './gateEvents'
import type { CellGate } from './gateTable'
import './gateEvents'

export const GATE_LEDGER_ID = 'mining-gates.gate-ledger'

export const gateLedger: AuthorityReaction = { id: GATE_LEDGER_ID, react: recordGatedCells }

/** One cell's whole ore unit freed or lost. */
const UNITS_PER_CELL = 1

type Destroyed = Extract<DomainEvent, { type: 'TileDestroyed' }>

function recordGatedCells(
  before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  const params = planetParamsOf(before.planet)
  if (params === null) return unchanged(after)
  const events = destroyedOreOf(heard).flatMap((destroyed) =>
    ledgerEventsOf(before, params, destroyed, heard),
  )
  return { state: after, events }
}

function destroyedOreOf(heard: readonly DomainEvent[]): Destroyed[] {
  return heard.filter(
    (event): event is Destroyed => event.type === 'TileDestroyed' && event.kind === 'ore',
  )
}

function ledgerEventsOf(
  before: AuthorityState,
  params: PlanetParams,
  destroyed: Destroyed,
  heard: readonly DomainEvent[],
): DomainEventBody[] {
  const tile = { tx: destroyed.tx, ty: destroyed.ty }
  const ore = oreTypeAtTile(before, tile)
  if (ore === null) return []
  const gate = cellGateOf(params, tile, ore)
  if (gate.kind === 'none') return []
  if (isLostAt(heard, tile)) return lostEventsOf(gate, tile, ore)
  return [clearedEventOf(gate, tile, ore, methodOf(gate, destroyed))]
}

export function clearedEventOf(gate: CellGate, tile: TilePoint, ore: OreType, method: ClearMethod) {
  return {
    type: 'mining-gates.GateCleared' as const,
    ...tile,
    oreId: ore.id,
    tier: ore.tier,
    gateKind: gateKindNameOf(gate),
    method,
    units: UNITS_PER_CELL,
    value: toCanonical(oreSalePrice(saleTierOf(ore))),
  }
}

/** Only an extractor gate loses a cell, and only one whose extractor names how. */
function lostEventsOf(gate: CellGate, tile: TilePoint, ore: OreType): DomainEventBody[] {
  if (gate.kind !== 'rig' || gate.rig.lostAs === null) return []
  return [
    {
      type: 'mining-gates.GateOreLost',
      ...tile,
      oreId: ore.id,
      tier: ore.tier,
      units: UNITS_PER_CELL,
      cause: gate.rig.lostAs,
    },
  ]
}

/** Whether the drill's gate said the cell at the tile was lost in this step. */
export function isLostAt(heard: readonly DomainEvent[], { tx, ty }: TilePoint): boolean {
  return heard.some(
    (event) =>
      event.type === 'DrillGated' && event.outcome === 'lost' && event.tx === tx && event.ty === ty,
  )
}

function methodOf(gate: CellGate, destroyed: Destroyed): ClearMethod {
  if (destroyed.cause === 'blast') return 'dynamite'
  return gate.kind === 'rig' ? 'rig' : 'drill'
}

function gateKindNameOf(gate: CellGate): GateKindName {
  if (gate.kind === 'rig' || gate.kind === 'dynamite') return gate.kind
  return 'drill'
}
