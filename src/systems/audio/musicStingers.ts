/**
 * Which stingers a batch of authority events plays (#49): `dock` on `dock_entered`, `core` on the
 * first core fragment of a planet (`CoreReached`, the first core tile broken), `artefact` when the
 * artefact choice opens, and `reveal` when a platform module bolts on (#105: a schedule row with a
 * `facility` bind opens, the Refinery bay on arriving at planet 3). Read from the events only, so
 * replaying the same commands plays the same stingers in the same order, and nothing here can
 * touch state or the digest.
 */
import type { DomainEvent } from '../authority/domainEvent'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import type { StingerId } from './musicBook'

type StingerTrigger = ((event: DomainEvent) => boolean) | null

/**
 * The event that plays each stinger. S10 (#64) builds the artefact cache and the event that opens
 * its choice; until it lands nothing opens the choice, so the artefact stinger has no trigger yet.
 */
const STINGER_TRIGGERS: Readonly<Record<StingerId, StingerTrigger>> = {
  dock: (event) => event.type === 'DockEntered',
  core: (event) => event.type === 'CoreReached',
  artefact: null,
  reveal: (event) => event.type === 'FeatureUnlocked' && isFacilityRow(event.featureId),
}

const FACILITY_ROW_IDS: ReadonlySet<string> = new Set(
  LOCKED_SCHEDULE.rows.filter((row) => row.bind === 'facility').map((row) => row.id),
)

/** The local player's stingers in a batch, in the order their events happened. */
export function musicStingersOf(events: readonly DomainEvent[], playerId: string): StingerId[] {
  return events
    .filter((event) => event.playerId === undefined || event.playerId === playerId)
    .flatMap((event) => stingerOfEvent(event) ?? [])
}

function stingerOfEvent(event: DomainEvent): StingerId | null {
  const entry = Object.entries(STINGER_TRIGGERS).find(([, trigger]) => trigger?.(event) ?? false)
  return entry === undefined ? null : (entry[0] as StingerId)
}

function isFacilityRow(featureId: string): boolean {
  return FACILITY_ROW_IDS.has(featureId)
}
