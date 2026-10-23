/**
 * A kind slot's window by ore rules (ticket 738, Bjor's deep-rares rule, GD lock on #737): the
 * bands a kind is live in may narrow at an ore rules version. `window` is the newest, the one a
 * species row restates as its `gradeBand`; `windowsBeforeOreRules` maps an ore rules version to the
 * window a planet stamped before it keeps, so a planet a save holds under older rules draws its
 * kinds in the bands it always did and its unmined chunks never seam against the dug ones.
 */
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { ORE_RULES_VERSION } from '../../../systems/world/planetParams'
import { isPlainMap } from './planetRows'

/** The first and last band of a window. */
export type BandWindow = readonly [number, number]

/** The window a slot had before an ore rules version narrowed it. */
export interface EarlierWindow {
  /** The ore rules that moved the slot off this window. */
  beforeOreRules: number
  window: BandWindow
}

/** One of a slot's windows with the ore rules it holds under, from `fromOreRules` to before `beforeOreRules`. */
export interface WindowSpan {
  window: BandWindow
  fromOreRules: number
  beforeOreRules: number
}

/** What a window by ore rules needs of a slot. */
export interface WindowedSlot {
  window: BandWindow
  /** Earliest rules first; absent when the window never moved. */
  earlierWindows?: readonly EarlierWindow[]
}

/** The first ore rules a stamp can carry a roster under: rules 1 was the rarity rows alone. */
const FIRST_WINDOW_ORE_RULES = 2
const WHOLE_KEY = /^[1-9][0-9]*$/

/** The window the slot is live in on a planet entered under ore rules `oreRulesVersion`. */
export function liveWindowOf(slot: WindowedSlot, oreRulesVersion: number | undefined): BandWindow {
  const rules = oreRulesVersion ?? 0
  const earlier = slot.earlierWindows?.find((row) => rules < row.beforeOreRules)
  return earlier?.window ?? slot.window
}

/** Whether band `band` is in the slot's window on a planet entered under `oreRulesVersion`. */
export function isSlotLiveInBand(
  slot: WindowedSlot,
  band: number,
  oreRulesVersion: number | undefined,
): boolean {
  const [first, last] = liveWindowOf(slot, oreRulesVersion)
  return band >= first && band <= last
}

/** Every window the slot holds under some ore rules, earliest first, with the rules of each. */
export function windowSpansOf(slot: WindowedSlot): WindowSpan[] {
  const earlier = slot.earlierWindows ?? []
  const starts = [0, ...earlier.map((row) => row.beforeOreRules)]
  return [...earlier, { beforeOreRules: Infinity, window: slot.window }].map((row, at) => ({
    window: row.window,
    fromOreRules: starts[at],
    beforeOreRules: row.beforeOreRules,
  }))
}

/** The earlier windows as typed rows, earliest rules first; call only on a table the guard accepts. */
export function earlierWindowsOf(table: unknown): EarlierWindow[] | undefined {
  if (table === undefined) return undefined
  return Object.entries(table as Record<string, number[]>)
    .map(([rules, [first, last]]) => ({
      beforeOreRules: Number.parseInt(rules, 10),
      window: [first, last] as const,
    }))
    .sort((a, b) => a.beforeOreRules - b.beforeOreRules)
}

/** Why a slot's `windowsBeforeOreRules` is not ore rules versions this build knows mapped to windows. */
export function earlierWindowTableProblems(table: unknown, where: string): string[] {
  if (table === undefined) return []
  const field = `${where}.windowsBeforeOreRules`
  if (!isPlainMap(table)) return [`${field} must map ore rules versions to band windows`]
  return Object.entries(table).flatMap(([rules, window]) => [
    ...(isKnownOreRulesKey(rules)
      ? []
      : [
          `${field}.${rules} must be an ore rules version from ${FIRST_WINDOW_ORE_RULES} to ${ORE_RULES_VERSION}`,
        ]),
    ...(isBandWindow(window) ? [] : [`${field}.${rules} must be [first, last] in 1..5`]),
  ])
}

export function isBandWindow(window: unknown): boolean {
  if (!Array.isArray(window) || window.length !== 2) return false
  const [first, last] = window as unknown[]
  return isBand(first) && isBand(last) && (first as number) <= (last as number)
}

function isKnownOreRulesKey(rules: string): boolean {
  const version = WHOLE_KEY.test(rules) ? Number.parseInt(rules, 10) : 0
  return version >= FIRST_WINDOW_ORE_RULES && version <= ORE_RULES_VERSION
}

function isBand(band: unknown): boolean {
  return Number.isSafeInteger(band) && (band as number) >= 1 && (band as number) <= BAND_COUNT
}
