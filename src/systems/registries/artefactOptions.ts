/**
 * The artefact options a cache offers (K2 #324, from the GD lock on #206, decisions 3 to 5): the
 * kernel's three from `artefactOptions.json` (#46), always first and in their table order, then
 * each slice option whose `isOfferedTo` says yes, sorted by id. With nothing registered the cache
 * offers the same three cards in the same order.
 *
 * Every option is one more card of the same pick: #46's one-pick and picked-once rules hold, and
 * the player's `HeldArtefact` keeps its shape. Whether an id names an artefact at all is answered
 * here, for the rules, the held artefact and the save alike. An option never claims a schedule row
 * (the Horizontal Scaler's condition on #206): picking it opens the cache's rows, never its own.
 */
import { artefactIconIdOf } from '../art/icons/iconSet'
import { ARTEFACT_IDS, ARTEFACT_OPTIONS, type ArtefactOption } from '../artefacts/artefactOptions'
import { uniquenessGateProblems } from '../artefacts/uniquenessGate'
import type { AuthorityState } from '../authority/authorityState'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

/** One card a cache may offer: the option's text and declared effects, its icon and its card. */
export interface OfferedArtefactOption extends Omit<ArtefactOption, 'id'> {
  id: string
  iconId: string
}

export interface ArtefactOptionEntry extends OfferedArtefactOption {
  /** Whether this player's cache shows the card now, such as once its base item is owned. */
  isOfferedTo(state: AuthorityState, playerId: string): boolean
}

export const ARTEFACT_OPTION_REGISTRY = defineRegistry<ArtefactOptionEntry>(
  'artefactOptions',
  artefactOptionSealProblem,
)

/** The cards `playerId`'s cache offers: the kernel's three, then the slice options offered now. */
export function artefactOptionsOfferedTo(
  state: AuthorityState,
  playerId: string,
): readonly OfferedArtefactOption[] {
  const offered = entriesOf(ARTEFACT_OPTION_REGISTRY).filter((entry) =>
    entry.isOfferedTo(state, playerId),
  )
  return [...KERNEL_OFFERS, ...offered]
}

/** Every option any cache could offer, offered now or not: the kernel's three, then the slices'. */
export function everyArtefactOption(): readonly OfferedArtefactOption[] {
  return [...KERNEL_OFFERS, ...entriesOf(ARTEFACT_OPTION_REGISTRY)]
}

/** A kernel id, or one a slice registered; a kernel id never reads the registries. */
export function isKnownArtefactId(value: unknown): value is string {
  if ((ARTEFACT_IDS as readonly unknown[]).includes(value)) return true
  return entriesOf(ARTEFACT_OPTION_REGISTRY).some((entry) => entry.id === value)
}

export function isArtefactOfferedTo(
  state: AuthorityState,
  playerId: string,
  optionId: string,
): boolean {
  return artefactOptionsOfferedTo(state, playerId).some((option) => option.id === optionId)
}

/** The kernel's three as cards, drawn with the icon each id names (#158). */
const KERNEL_OFFERS: readonly OfferedArtefactOption[] = ARTEFACT_OPTIONS.map((option) => ({
  ...option,
  iconId: artefactIconIdOf(option.id),
}))

function artefactOptionSealProblem(
  registrations: readonly SealedRegistration<ArtefactOptionEntry>[],
): string | null {
  const problems = registrations.flatMap(({ entry }) => registeredOptionProblems(entry))
  return problems.length === 0 ? null : problems.join('; ')
}

/** A slice option passes the #46 uniqueness gate and takes neither a kernel nor a row id. */
function registeredOptionProblems(entry: ArtefactOptionEntry): string[] {
  return [
    ...uniquenessGateProblems(entry),
    ...(isKernelArtefactId(entry.id) ? [`${entry.id} is a kernel artefact option`] : []),
    ...(isScheduleRowId(entry.id) ? [`${entry.id} is a schedule row, never an option`] : []),
  ]
}

function isKernelArtefactId(id: string): boolean {
  return (ARTEFACT_IDS as readonly string[]).includes(id)
}

function isScheduleRowId(id: string): boolean {
  return LOCKED_SCHEDULE.rows.some((row) => row.id === id)
}
