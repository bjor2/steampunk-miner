/**
 * The twin-bit head (GD lock on #257, ticket 280): while it sits in `drill.head`, the drill's ahead
 * cell follows the drive. Drilling down with a side pushed, the kernel's drill gear read cuts the
 * cell diagonally below the bit on that side instead of the cell past it: one cell under
 * `aheadCellsMax`, through `canMine`, at its own full hardness and at least the bit's energy (the
 * side floor), latched per cell (feature-slices.md 3.28). Driving straight down cuts as the bare
 * drill, because a drive-aimed ask cuts ahead only on the diagonal (TD lock on #280). No new key,
 * and no penalty for drilling up.
 *
 * Each diagonal cell the drill finishes is logged as `drill-gear.DiagonalCellCut` by an authority
 * reaction, read from the latch the cut left on the vehicle.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import type { DrillGearAsk } from '../../../systems/economy/drillGearCaps'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { DrillGearSource } from '../../../systems/registries/drillGear'
import type { AheadLatch } from '../../../systems/vehicle/aheadBearingLatch'
import { itemInSlot } from '../../../systems/vehicle/loadoutState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { gearValueOf } from './drillGearItems'
import type { DiagonalBearing } from './drillGearEvents'

export const TWIN_BIT_ID = 'gear.twin_bit'

interface DiagonalLatch {
  bearing: DiagonalBearing
  tile: TilePoint
}

export const TWIN_BIT_SOURCE: DrillGearSource = {
  id: 'drill-gear.twin-bit',
  gearOf: twinBitAskOf,
}

export const DIAGONAL_CUT_REACTION: AuthorityReaction = {
  id: 'drill-gear.diagonal-cut',
  react: (_before, after, heard) => reportDiagonalCut(after, heard),
}

/** One ahead cell the drive aims, while the head is mounted; nothing otherwise. */
function twinBitAskOf(state: AuthorityState, playerId: string): DrillGearAsk | null {
  if (!isTwinBitMounted(state, playerId)) return null
  return { aheadCells: gearValueOf(TWIN_BIT_ID, 'aheadCells'), aheadAim: 'drive' }
}

export function isTwinBitMounted(state: AuthorityState, playerId: string): boolean {
  if (!Object.hasOwn(state.players, playerId)) return false
  return itemInSlot(vehicleOf(state, playerId).loadout, 'drill.head') === TWIN_BIT_ID
}

function reportDiagonalCut(state: AuthorityState, heard: readonly DomainEvent[]): RuleEffect {
  const cut = diagonalCellCutOf(state, heard)
  return cut === null ? unchanged(state) : { state, events: [cut] }
}

/** The diagonal cell this drill command finished, for the head's player; null for any other. */
function diagonalCellCutOf(
  state: AuthorityState,
  heard: readonly DomainEvent[],
): DomainEventBody | null {
  const playerId = heard.find((event) => event.type === 'DrillDamageDealt')?.playerId
  if (playerId === undefined || !isTwinBitMounted(state, playerId)) return null
  const latch = diagonalLatchOf(vehicleOf(state, playerId).aheadLatch)
  if (latch === null || !isDestroyedIn(heard, latch.tile)) return null
  const { tx, ty } = latch.tile
  return { type: 'drill-gear.DiagonalCellCut', playerId, tx, ty, bearing: latch.bearing }
}

/** The latch the cut left, when it turned the ahead cell off the facing. */
function diagonalLatchOf(latch: AheadLatch | undefined): DiagonalLatch | null {
  if (latch === undefined || latch.bearing === 'facing') return null
  return { bearing: latch.bearing, tile: latch.tile }
}

function isDestroyedIn(heard: readonly DomainEvent[], tile: TilePoint): boolean {
  return heard.some(
    (event) => event.type === 'TileDestroyed' && event.tx === tile.tx && event.ty === tile.ty,
  )
}
