/**
 * The hazard tools' outcomes as tags on the HUD overlay (ticket 882, PK4c T2; the done-when row
 * "each outcome reads on screen at 360 px and 1920x1080"): a short tag over the cell each outcome
 * acted on, from the authority's events, and one over every open flask's cleared firedamp, from
 * the replica's holdings, for as long as it is open.
 *
 * - `Scree shoved` over the open cell the plough moved the scree into;
 * - `Shard looted` over the cluster the tongs lifted;
 * - `Vane ride` over the cell the vaned shove carries the rig to;
 * - `Firedamp cleared` over the flask's uncork cell while it is open.
 *
 * An event's tag shows for `OUTCOME_TAG_TICKS` from its tick. Presentation only: nothing here
 * reaches the authority, a save or the log. Pure, so the specs read what is drawn.
 */
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import type { TilePoint } from '../../../../systems/world/tileGrid'
import { openFlaskZoneOf } from '../flaskClear'
import { kitHoldingsOf } from '../kitHoldingsSection'

/** How long an event's tag shows: 1.5 s at the fixed 60 steps a second, long enough to read. */
export const OUTCOME_TAG_TICKS = 90
/** The most heard outcomes kept for their tags; older ones have long expired. */
export const HEARD_OUTCOMES_KEPT = 16

export type KitOutcomeVerb = 'scree_shoved' | 'shard_looted' | 'vane_ride' | 'firedamp_cleared'

export const OUTCOME_TAG_LABELS: Readonly<Record<KitOutcomeVerb, string>> = {
  scree_shoved: 'Scree shoved',
  shard_looted: 'Shard looted',
  vane_ride: 'Vane ride',
  firedamp_cleared: 'Firedamp cleared',
}

/** An outcome the client heard: what it was, where, and its tick. */
export interface HeardOutcome {
  verb: KitOutcomeVerb
  cell: TilePoint
  tick: number
}

export interface KitOutcomeTag {
  /** Stable while the tag shows: its verb, cell and tick. */
  key: string
  verb: KitOutcomeVerb
  label: string
  cell: TilePoint
}

/** The outcomes in a batch of events, in their order. */
export function heardOutcomesOf(events: readonly DomainEvent[]): HeardOutcome[] {
  return events.flatMap((event): HeardOutcome[] => {
    if (event.type === 'planet-kit.ScreeShoved') {
      return [{ verb: 'scree_shoved', cell: { tx: event.toTx, ty: event.toTy }, tick: event.tick }]
    }
    if (event.type === 'planet-kit.ShardLooted') {
      return [{ verb: 'shard_looted', cell: { tx: event.tx, ty: event.ty }, tick: event.tick }]
    }
    if (event.type === 'planet-kit.VaneRidden') {
      return [{ verb: 'vane_ride', cell: { tx: event.toTx, ty: event.toTy }, tick: event.tick }]
    }
    return []
  })
}

/** The newest `HEARD_OUTCOMES_KEPT` of what was kept and what was just heard. */
export function withHeardOutcomes(
  kept: readonly HeardOutcome[],
  heard: readonly HeardOutcome[],
): HeardOutcome[] {
  return [...kept, ...heard].slice(-HEARD_OUTCOMES_KEPT)
}

/** The tags to draw at the state's tick: live event tags, then every open flask's zone. */
export function kitOutcomeTagsOf(
  heard: readonly HeardOutcome[],
  state: AuthorityState,
): KitOutcomeTag[] {
  const live = heard.filter((outcome) => isTagShowing(outcome.tick, state.tick))
  return [...live.map(tagOf), ...openFlaskTagsOf(state)]
}

function isTagShowing(heardTick: number, tick: number): boolean {
  return tick >= heardTick && tick < heardTick + OUTCOME_TAG_TICKS
}

function openFlaskTagsOf(state: AuthorityState): KitOutcomeTag[] {
  return Object.keys(state.players)
    .sort()
    .flatMap((playerId) => {
      const zone = openFlaskZoneOf(kitHoldingsOf(state, playerId), state.tick)
      return zone === null ? [] : [tagOf({ verb: 'firedamp_cleared', cell: zone.at, tick: 0 })]
    })
}

function tagOf(outcome: HeardOutcome): KitOutcomeTag {
  const { verb, cell, tick } = outcome
  return {
    key: `${verb}:${cell.tx},${cell.ty}:${tick}`,
    verb,
    label: OUTCOME_TAG_LABELS[verb],
    cell,
  }
}
