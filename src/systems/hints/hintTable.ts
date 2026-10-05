/**
 * The hint and transmission table (#16, #2 narrative stubs) as data in `src/data/hints/hints.json`:
 * the five hints with the condition each is shown and dismissed on, the three transmissions with
 * the condition each appears on, and the 20 s (1200 ticks) the hints keep apart. Text is at most
 * two lines and names actions; `{actionId}` prints the key bound to that action now (#33), and the
 * energy hint's `{fee}` and `{cargoLost}` print what a tow cost.
 *
 * Refused whole at load on any problem, like the action map.
 */
import SHIPPED_HINT_TABLE from '../../data/hints/hints.json'
import { isActionId } from '../input/actionMap'
import { isHintConditionName, type HintConditionName } from './hintConditions'

export interface HintDef {
  id: string
  shownWhen: HintConditionName
  dismissedWhen: HintConditionName
  lines: readonly string[]
  /** The text once a tow has happened (#16: what was lost and what it cost). */
  afterRescueLines?: readonly string[]
}

export interface TransmissionDef {
  id: string
  shownWhen: HintConditionName
  lines: readonly string[]
}

export interface HintTable {
  hintsVersion: number
  minTicksBetweenHints: number
  hints: readonly HintDef[]
  transmissions: readonly TransmissionDef[]
}

export const HINTS_VERSION = 1

/** The hint whose plaque also highlights "Sell, repair and recharge" on the platform (#16). */
export const DOCK_HINT_ID = 'hint_dock'

/** Placeholders that are not action ids: the tow's cost. */
const COST_PLACEHOLDERS = ['fee', 'cargoLost']
const MAX_LINES = 2
const PLACEHOLDER = /\{([^}]*)\}/g

export const HINT_TABLE: HintTable = loadShippedHintTable()

/** Every hint and transmission id, the ones a preferences file's seen-set may name. */
export function plaqueIdsOf(table: HintTable): string[] {
  return [...table.hints, ...table.transmissions].map((entry) => entry.id)
}

/** Every problem in a raw hint table; empty when it can be used as it is. */
export function hintTableProblems(raw: unknown): string[] {
  if (!isRecord(raw)) return ['the hint table must be an object']
  const hints = Array.isArray(raw.hints) ? raw.hints : []
  const transmissions = Array.isArray(raw.transmissions) ? raw.transmissions : []
  return [
    ...(raw.hintsVersion === HINTS_VERSION ? [] : [`hintsVersion must be ${HINTS_VERSION}`]),
    ...(isWholeTicks(raw.minTicksBetweenHints)
      ? []
      : ['minTicksBetweenHints must be a whole number of ticks']),
    ...(Array.isArray(raw.hints) ? [] : ['hints must be a list']),
    ...(Array.isArray(raw.transmissions) ? [] : ['transmissions must be a list']),
    ...hints.flatMap((hint, index) => hintProblems(hint, `hints[${index}]`)),
    ...transmissions.flatMap((entry, index) =>
      transmissionProblems(entry, `transmissions[${index}]`),
    ),
    ...duplicateIdProblems([...hints, ...transmissions]),
    ...(hints.some((hint) => isRecord(hint) && hint.id === DOCK_HINT_ID)
      ? []
      : [`hints must include ${DOCK_HINT_ID}`]),
  ]
}

function loadShippedHintTable(): HintTable {
  const problems = hintTableProblems(SHIPPED_HINT_TABLE)
  if (problems.length > 0) throw new Error(`hints.json refused: ${problems.join('; ')}`)
  return SHIPPED_HINT_TABLE as unknown as HintTable
}

function hintProblems(hint: unknown, where: string): string[] {
  if (!isRecord(hint)) return [`${where} must be an object`]
  return [
    ...transmissionProblems(hint, where),
    ...conditionProblems(hint.dismissedWhen, `${where}.dismissedWhen`),
    ...(hint.afterRescueLines === undefined
      ? []
      : linesProblems(hint.afterRescueLines, `${where}.afterRescueLines`)),
  ]
}

function transmissionProblems(entry: unknown, where: string): string[] {
  if (!isRecord(entry)) return [`${where} must be an object`]
  return [
    ...(typeof entry.id === 'string' && entry.id !== '' ? [] : [`${where}.id must be a name`]),
    ...conditionProblems(entry.shownWhen, `${where}.shownWhen`),
    ...linesProblems(entry.lines, `${where}.lines`),
  ]
}

function conditionProblems(name: unknown, where: string): string[] {
  return isHintConditionName(name) ? [] : [`${where}: ${JSON.stringify(name)} is not a condition`]
}

function linesProblems(lines: unknown, where: string): string[] {
  const isLineList =
    Array.isArray(lines) && lines.every((line) => typeof line === 'string' && line !== '')
  if (!isLineList || lines.length === 0 || lines.length > MAX_LINES) {
    return [`${where} must be 1 to ${MAX_LINES} lines of text`]
  }
  return lines.flatMap((line: string) => placeholderProblems(line, where))
}

function placeholderProblems(line: string, where: string): string[] {
  return [...line.matchAll(PLACEHOLDER)]
    .map((match) => match[1])
    .filter((name) => !isActionId(name) && !COST_PLACEHOLDERS.includes(name))
    .map((name) => `${where}: {${name}} is neither an action id nor ${COST_PLACEHOLDERS.join('/')}`)
}

function duplicateIdProblems(entries: readonly unknown[]): string[] {
  const ids = entries.filter(isRecord).map((entry) => entry.id)
  return ids
    .filter((id, index) => ids.indexOf(id) !== index)
    .map((id) => `${JSON.stringify(id)} is listed twice`)
}

function isWholeTicks(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
