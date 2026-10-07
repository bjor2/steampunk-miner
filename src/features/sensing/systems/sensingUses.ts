/**
 * The sensing uses in a batch of authority events: each `power-up-core.PowerUpUsed` of a shipped
 * echo sounder, flare mortar or signal buoy, with the tick it acted on, its Mark and its origin.
 * Everything a client draws for a use comes from this one line (the TD lock on #203 Q1), so the
 * authority keeps no reveal state. A held item's use, were one ever logged, is no sensing use (the
 * Horizontal guard on #203: no markers for the galvanic probe or the void sounder).
 */
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { TilePoint } from '../../../systems/world/tileGrid'

export const ECHO_SOUNDER = 'power.echo_sounder'
export const FLARE_MORTAR = 'consumable.flare_mortar'
export const SIGNAL_BUOY = 'consumable.signal_buoy'

export type RevealItemId = typeof ECHO_SOUNDER | typeof FLARE_MORTAR | typeof SIGNAL_BUOY

const REVEAL_ITEM_IDS: readonly string[] = [ECHO_SOUNDER, FLARE_MORTAR, SIGNAL_BUOY]

export interface SensingUse {
  itemId: RevealItemId
  playerId: string
  tick: number
  /** The Mark it acted at; 0 for none researched, which acts as bought (#249). */
  mark: number
  origin: TilePoint
}

/** The batch's sensing uses, in the order they were logged. */
export function sensingUsesOf(events: readonly DomainEvent[]): SensingUse[] {
  return events.flatMap(sensingUseOf)
}

function sensingUseOf(event: DomainEvent): SensingUse[] {
  if (event.type !== 'power-up-core.PowerUpUsed' || !isRevealItemId(event.itemId)) return []
  return [
    {
      itemId: event.itemId,
      playerId: event.playerId,
      tick: event.tick,
      mark: event.mark,
      origin: { tx: event.originTx, ty: event.originTy },
    },
  ]
}

function isRevealItemId(itemId: string): itemId is RevealItemId {
  return REVEAL_ITEM_IDS.includes(itemId)
}
