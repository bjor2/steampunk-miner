/**
 * The hazard tools' outcomes the client heard (ticket 882), for their tags on the HUD overlay:
 * the newest few from `listenForDomainEvents`, kept in module scope, and the tags read from them
 * with the replica's open flasks. Presentation only: nothing here reaches the authority, the game
 * store or the log.
 */
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { readAuthorityState } from '../../../store/authorityLink'
import {
  heardOutcomesOf,
  kitOutcomeTagsOf,
  withHeardOutcomes,
  type HeardOutcome,
  type KitOutcomeTag,
} from '../systems/render/kitOutcomeTags'

let heard: HeardOutcome[] = []

/** A `listenForDomainEvents` listener. */
export function hearKitOutcomes(events: readonly DomainEvent[]): void {
  heard = withHeardOutcomes(heard, heardOutcomesOf(events))
}

export function readKitOutcomeTags(): KitOutcomeTag[] {
  return kitOutcomeTagsOf(heard, readAuthorityState())
}
