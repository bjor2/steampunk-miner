/**
 * The cell a unit into the hold came from, as the codex pairs it (ticket 546): the drill raises
 * its broken cell's `TileDestroyed`, with no cause, just before the unit's `CargoAdded`. A blast's
 * and a bore's tiles name their cause and their units follow all of the tiles, so none pairs.
 */
import type { DomainEvent } from '../../../systems/authority/domainEvent'

export type TileDestroyed = Extract<DomainEvent, { type: 'TileDestroyed' }>

/** The drill's broken cell when `previous` is it; null for any other event. */
export function drilledCellBefore(previous: DomainEvent | undefined): TileDestroyed | null {
  const isDrillBroken = previous?.type === 'TileDestroyed' && previous.cause === undefined
  return isDrillBroken ? previous : null
}
