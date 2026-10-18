/**
 * Spec support for the `material:<species id>` record (ticket 546): the kill-switch put back after
 * a run, the species a cell's kind slot binds, and the touch events the codex reaction hears.
 */
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../../constants/devFlags'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell, kindSlotOfCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { planetSpeciesOf } from '../../roster'

/**
 * Runs `play` with the authority's `codex.materialContact` as `isOn`, put back after: the codex
 * reaction reads it at call time and it ships on.
 */
export function withMaterialContact<T>(isOn: boolean, play: () => T): T {
  const flags = AUTHORITY_DEV_FLAGS as { -readonly [K in keyof AuthorityDevFlags]: boolean }
  const shipped = flags['codex.materialContact']
  flags['codex.materialContact'] = isOn
  try {
    return play()
  } finally {
    flags['codex.materialContact'] = shipped
  }
}

/** The species id an ore cell's kind slot binds on the state's planet; null for none. */
export function speciesIdAt(state: AuthorityState, tile: TilePoint): string | null {
  const params = planetParamsOf(state.planet)
  if (params === null) return null
  const cell = cellAt(state.world, params, tile)
  if (kindOfCell(cell) !== CELL_KIND.ore) return null
  return planetSpeciesOf(params, kindSlotOfCell(cell))?.id ?? null
}

const STAMP = { playerId: 'p1', tick: 10, seq: 1 }

export function drillDamageAt(tile: TilePoint): DomainEvent {
  return { ...STAMP, type: 'DrillDamageDealt', ...tile, ticks: 4, damage: '1e+0' }
}

export function drillGatedAt(tile: TilePoint, oreId: string): DomainEvent {
  return {
    ...STAMP,
    type: 'DrillGated',
    ...tile,
    oreId,
    family: 'metal',
    tier: 1,
    gateKind: 'probe',
    outcome: 'refused',
    required: 'rig',
    have: 'none',
  }
}

/** The drill's broken cell, or a blast's or a bore's with `cause`. */
export function tileDestroyedAt(tile: TilePoint, cause?: 'blast' | 'bore'): DomainEvent {
  return { ...STAMP, type: 'TileDestroyed', ...tile, kind: 'ore', ...(cause && { cause }) }
}

export function cargoAddedOf(oreId: string): DomainEvent {
  return {
    ...STAMP,
    type: 'CargoAdded',
    resourceTier: 1,
    amount: 1,
    value: '1e+0',
    oreId,
    depthTiles: 0,
    chunk: '0,0',
  }
}

export function oreSampledAt(tile: TilePoint, oreId: string, via: 'corer' | 'lens'): DomainEvent {
  return { ...STAMP, type: 'OreSampled', ...tile, oreId, via }
}

/** A sensing or held item used with its origin on `tile`, as the slot press says it. */
export function powerUpUsedAt(tile: TilePoint, itemId: string): DomainEvent {
  return {
    ...STAMP,
    type: 'power-up-core.PowerUpUsed',
    itemId,
    slot: 'powerup.1',
    mark: 1,
    originTx: tile.tx,
    originTy: tile.ty,
    chargesLeft: 1,
  } as DomainEvent
}
