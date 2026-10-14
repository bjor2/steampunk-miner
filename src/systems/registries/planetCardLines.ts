/**
 * The lines of the planet card (GD ruling on #293 Q2, TD lock with its addendum; ticket 343): each
 * planet class a slice ships adds its tag, its arrival line and later typed values (#306's σ_s, V_p
 * and toughness) here, so every class shares the kernel's one card instead of drawing its own.
 *
 * The Horizontal Scaler's pins:
 * - **Live classes only.** A source names the schedule row of its planet class (`featureId`) and
 *   shows nothing until that row is open on the session's planet (`FeatureUnlocked`), so a vision
 *   row's class never shows, whatever data it already has.
 * - **The hazard and the gate kind only.** A line carries the tag, the arrival line, the gate kind
 *   and typed values; the card copies those fields and nothing else, so a vision row, a held item,
 *   an unbuilt rig, a dynamite size or a counter-item to buy has no field to show through.
 * - **Never an unlock.** The seal refuses a source whose id names a schedule row, and a line whose
 *   text names one is refused with the read, never trimmed: unlocks are stats.json's and
 *   `feature_unlocked`'s, so the card can neither act as one nor preview one.
 *
 * Client-side presentation: nothing here reaches a command, a snapshot, a log line or a digest.
 */
import type { AuthorityState } from '../authority/authorityState'
import { isFeatureUnlocked } from '../authority/featureUnlocks'
import { planetParamsOf } from '../authority/planetOfState'
import type { Money } from '../money'
import { LOCKED_SCHEDULE, unlockIdNamedIn } from '../unlocks/unlockSchedule'
import type { PlanetParams } from '../world/planetParams'
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

/** A number the card states, as "Toughness ×1.4": a label, the amount and its unit. */
export interface PlanetCardValue {
  label: string
  amount: Money | number
  /** Printed after the amount; empty for none. */
  unit: string
}

/** What a source answers for a planet; any field it adds beyond these is never shown. */
export interface PlanetCardLineAnswer {
  /** The hazard's tag, as "Magnetic". */
  tag: string
  /** The hazard in the #159 ledger voice, read on arrival. */
  arrivalLine: string
  /** The kind of gate the planet's ground shows, as "electrified"; omitted or null for none. */
  gateKind?: string | null
  values?: readonly PlanetCardValue[]
}

export interface PlanetCardLineSource {
  /** `<slice>.<name>`; never a word that is a schedule row id. */
  id: string
  /** The schedule row (stats.json) of the source's planet class: no line until it is open. */
  featureId: string
  /** The planet's line; null where the planet is not of the source's class. */
  lineOf(params: PlanetParams): PlanetCardLineAnswer | null
}

/** One line as the card shows it. */
export interface PlanetCardLine {
  sourceId: string
  tag: string
  arrivalLine: string
  gateKind: string | null
  values: readonly PlanetCardValue[]
}

export interface PlanetCard {
  planetIndex: number
  /** In source-id order; never empty. */
  lines: readonly PlanetCardLine[]
}

export const PLANET_CARD_LINE_REGISTRY = defineRegistry<PlanetCardLineSource>(
  'planetCardLines',
  planetCardLineSealProblem,
)

/** The card of the session's planet; null where no live class has a line for it. */
export function planetCardOf(state: AuthorityState): PlanetCard | null {
  const params = planetParamsOf(state.planet)
  if (params === null) return null
  const lines = liveSourcesOn(state).flatMap((source) => shownLinesOf(source, params))
  return lines.length === 0 ? null : { planetIndex: params.planetIndex, lines }
}

function liveSourcesOn(state: AuthorityState): readonly PlanetCardLineSource[] {
  return entriesOf(PLANET_CARD_LINE_REGISTRY).filter((source) =>
    isFeatureUnlocked(state, source.featureId),
  )
}

function shownLinesOf(source: PlanetCardLineSource, params: PlanetParams): PlanetCardLine[] {
  const answer = source.lineOf(params)
  if (answer === null) return []
  const line = shownLineOf(source.id, answer)
  refuseUnlockWords(line)
  return [line]
}

/** Copies the shown fields one by one, so nothing else a source answers reaches the card. */
function shownLineOf(sourceId: string, answer: PlanetCardLineAnswer): PlanetCardLine {
  return {
    sourceId,
    tag: answer.tag,
    arrivalLine: answer.arrivalLine,
    gateKind: answer.gateKind ?? null,
    values: (answer.values ?? []).map(({ label, amount, unit }) => ({ label, amount, unit })),
  }
}

function refuseUnlockWords(line: PlanetCardLine): void {
  const unlockId = unlockIdNamedIn(LOCKED_SCHEDULE, textOfLine(line))
  if (unlockId === undefined) return
  throw new Error(
    `planet card line "${line.sourceId}" names the unlock id "${unlockId}": the card never ` +
      'shows or previews an unlock',
  )
}

function textOfLine(line: PlanetCardLine): string {
  const valueText = line.values.map((value) => `${value.label} ${value.unit}`)
  return [line.tag, line.arrivalLine, line.gateKind ?? '', ...valueText].join(' ')
}

function planetCardLineSealProblem(
  registrations: readonly SealedRegistration<PlanetCardLineSource>[],
): string | null {
  const problems = registrations.flatMap(({ entry }) => problemsOfSource(entry))
  return problems.length === 0 ? null : problems.join('; ')
}

function problemsOfSource(source: PlanetCardLineSource): string[] {
  const unlockId = unlockIdNamedIn(LOCKED_SCHEDULE, source.id)
  return [
    ...(unlockId === undefined ? [] : [`"${source.id}" names the unlock id "${unlockId}"`]),
    ...(isScheduledRow(source.featureId)
      ? []
      : [`"${source.id}" waits on "${source.featureId}", no schedule row`]),
  ]
}

function isScheduledRow(featureId: string): boolean {
  return LOCKED_SCHEDULE.rows.some((row) => row.id === featureId)
}
