/**
 * Bay entries (ticket 344, section 1 of the TD kernel lock on #314, ruled by the GD): things a
 * slice sells at the Upgrade bay through its own commands, such as the ground gun's mount and its
 * levelled tracks, drawn after the vehicle item rows. `vehicleItemSellers` does not fit them: it
 * sells one-off items the tree researched through the kernel's `buyVehicleItem`.
 *
 * - **`entriesOf(state, playerId)`** answers the source's entries now. Each `buy` is the kernel's
 *   `commandButton` over the slice's own command, so the price shown is the price debited and a
 *   refusal is the authority's. A track at its wall (a physical limit, never a planet cap) stays
 *   listed with `buy: null` and shows as Mastered (HS on #314).
 * - **`anchorFeatureId`** is the schedule row (stats.json) the source waits on: the bay asks
 *   `entriesOf` only once `FeatureUnlocked` holds for it (`views/bayEntryRows.ts`), so a vision
 *   row never shows an entry.
 *
 * The seal refuses an anchor that is no row of the locked schedule and a source id naming an
 * unlock id; an entry id naming one is refused when the bay reads it, since only `entriesOf`
 * knows its entry ids. Unlocks are stats.json's and `feature_unlocked`'s alone.
 */
import type { AuthorityState } from '../authority/authorityState'
import { LOCKED_SCHEDULE, unlockIdNamedIn } from '../unlocks/unlockSchedule'
import type { ItemCardModel } from '../views/itemCardModel'
import type { AmountReading, ScreenButton } from '../views/viewParts'
import { defineRegistry, RegistrationRefusedError, type SealedRegistration } from './seal'

export interface BayEntry {
  /** The screen ids are `upgradebay-entry-<entryId>` and its `-buy`. */
  entryId: string
  iconId: string
  label: string
  levelText: string | null
  cost: AmountReading
  effectText: string | null
  /** The slice's command as a `commandButton`; null at the track's wall, which reads Mastered. */
  buy: ScreenButton | null
  /** The kernel item card this entry draws as, compact (K7 #199). */
  card: ItemCardModel
}

export interface BayEntrySource {
  id: string
  bay: 'upgrade'
  /** The `LOCKED_SCHEDULE` row that must be open before the source is asked. */
  anchorFeatureId: string
  entriesOf(state: AuthorityState, playerId: string): readonly BayEntry[]
}

export const BAY_ENTRY_REGISTRY = defineRegistry<BayEntrySource>('bayEntries', bayEntrySealProblem)

/** Throws when an entry id names an unlock id, as the seal does for a source id. */
export function refuseUnlockIdEntries(
  source: BayEntrySource,
  entries: readonly BayEntry[],
): readonly BayEntry[] {
  const problems = entries.flatMap((entry) => unlockIdProblemsOf(entry.entryId, source.id))
  if (problems.length > 0)
    throw new RegistrationRefusedError(`"bayEntries": ${problems.join('; ')}`)
  return entries
}

function bayEntrySealProblem(
  registrations: readonly SealedRegistration<BayEntrySource>[],
): string | null {
  const problems = registrations.flatMap(({ entry }) => problemsOfSource(entry))
  return problems.length === 0 ? null : problems.join('; ')
}

function problemsOfSource(source: BayEntrySource): string[] {
  return [...unscheduledAnchorProblems(source), ...unlockIdProblemsOf(source.id, source.id)]
}

function unscheduledAnchorProblems(source: BayEntrySource): string[] {
  if (isScheduledRow(source.anchorFeatureId)) return []
  return [`bay entry source "${source.id}" waits on "${source.anchorFeatureId}", no schedule row`]
}

function unlockIdProblemsOf(id: string, sourceId: string): string[] {
  const unlockId = unlockIdNamedIn(LOCKED_SCHEDULE, id)
  if (unlockId === undefined) return []
  return [`bay entry "${id}" of source "${sourceId}" names the unlock id "${unlockId}"`]
}

function isScheduledRow(featureId: string): boolean {
  return LOCKED_SCHEDULE.rows.some((row) => row.id === featureId)
}
