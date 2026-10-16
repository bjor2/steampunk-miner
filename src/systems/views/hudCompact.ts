/**
 * The compact HUD's status row (#500, GD ruling 4; TD shape 4.2): on a phone the banner is one
 * row of at most `MOST_STATUSES_SHOWN` chips, each an icon and a title of at most two words, so
 * the persistent top HUD never shows more than six label words. The vehicle state is its icon
 * alone while under way and a one-word chip otherwise; a combat status or a secondary one (cargo
 * full, the tow) is a chip in priority order; the rest fold into a "+N" count. A call-out's line
 * after its colon, and every gauge and readout name, live in the box's tap card instead.
 * Display only: the same model the full banner draws, read the compact way.
 *
 * With every control owned the view keeps its clear floor only if each row stays one line (#486,
 * the stacked case GD ruling 2 on #500 left to it): so a chip is its icon and the number its
 * title carries, its words in the status box's card as every gauge and readout name already is,
 * and a closed reading leaves the control it names in brackets to its card. Held upright the
 * threats are chips in the rows, since a marker at the screen's edge sits where the vehicle leans.
 */
import { MOST_STATUSES_SHOWN, type CombatStatusStack, type StatusUrgency } from './combatStatuses'
import { calloutTextOf } from './hudCallouts'
import type { VehicleStateReading } from './hudReadings'
import type { HudDensity, StageOrientation } from './screenLayout'
import { wordCountOf } from './uiTextBudget'
import type { UiText, UiTextTitlePlace } from './uiText'

/** One chip of the compact row: its icon, its words and how fast it pulses. */
export interface CompactChip {
  /** A status id, or `state` for the vehicle's own state. */
  id: string
  iconId: string
  title: string
  urgency: StatusUrgency
}

export interface CompactStatusRow {
  /** The vehicle state and its icon, always drawn: the row's anchor. */
  stateMode: VehicleStateReading['mode']
  stateIconId: string
  chips: CompactChip[]
  /** Statuses that did not fit, as the "+N" count says. */
  hiddenCount: number
}

/** At most two words a chip (the TD's product: 3 chips x 2 words = the 6-word budget). */
export const COMPACT_CHIP_WORDS_MAX = 2

/** The persistent top HUD shows at most this many label words (GD ruling 4 on #500). */
export const COMPACT_LABEL_WORDS_MAX = MOST_STATUSES_SHOWN * COMPACT_CHIP_WORDS_MAX

/**
 * The widest number a compact HUD box holds (VS on #500): `formatAmount`'s widest form is a sign,
 * three significant digits and a four-digit exponent, `-9.99e4000`; a planet's depth in tiles
 * and a tile time in seconds stay shorter. The same formatter as the full card, so the exact
 * value the card shows always matches.
 */
export const COMPACT_VALUE_CHARS_MAX = 10

/** "CARGO FULL" is the cargo icon and one word (GD ruling 4). */
export const CARGO_FULL_CHIP_TEXT = 'FULL'

const STATE_CHIP_ID = 'state'

/** A unit set apart from its number ("0.5 s", "10 s"): glued on, it reads as the number's. */
const SPACED_UNIT = /(\d) (?=[a-z%]{1,3}\b)/g

/** The control a reading names after its value, in brackets: " (Guns button)", " (C)". */
const BRACKETED_CONTROL = / \([^()]*\)$/

/** A word of a title that holds a number: "x2", "0.5s", "10s". */
const NUMBER_WORD = /\S*\d\S*/g

export function compactStatusRowOf(
  statuses: CombatStatusStack,
  vehicleState: VehicleStateReading,
): CompactStatusRow {
  const candidates = [...stateChipsOf(vehicleState), ...statusChipsOf(statuses)]
  return {
    stateMode: vehicleState.mode,
    stateIconId: vehicleState.icon,
    chips: candidates.slice(0, MOST_STATUSES_SHOWN),
    hiddenCount: statuses.hiddenCount + Math.max(0, candidates.length - MOST_STATUSES_SHOWN),
  }
}

/**
 * The words a chip says: the call-out's title before its colon with its units on their numbers
 * ("CHARGE LIT 0.5s", "tow in 10s"), or the one cargo word.
 */
export function compactChipTitleOf(status: { id: string; text: string }): string {
  if (status.id === 'cargo_full') return CARGO_FULL_CHIP_TEXT
  return calloutTextOf(status.id, status.text).title.replace(SPACED_UNIT, '$1')
}

/** Held upright, the compact HUD lays threats and prompts out as chips in its rows (#486). */
export function isUprightCompactHud(density: HudDensity, orientation: StageOrientation): boolean {
  return density === 'compact' && orientation === 'portrait'
}

/** The numbers a chip's title carries ("x2", "0.5s"), drawn by its icon when the words are not. */
export function compactChipValueOf(title: string): string {
  return (title.match(NUMBER_WORD) ?? []).join(' ')
}

/**
 * A reading's text in its box: the closed compact row leaves out the control the reading names in
 * brackets ("Auto (Guns button)" reads "Auto"), which its card still says (#486); the full HUD
 * and the open card show the whole text.
 */
export function compactReadingTextOf(text: string, titlePlace: UiTextTitlePlace): string {
  return titlePlace === 'card' ? text.replace(BRACKETED_CONTROL, '') : text
}

/** Label words an element shows on screen: its title unless the card holds it, and its line. */
export function shownLabelWordsOf(text: UiText): number {
  const titleWords = text.titlePlace === 'card' ? 0 : wordCountOf(text.title)
  return titleWords + wordCountOf(text.oneLine)
}

/** Under way is the default: its icon says it. Docked, stranded and wrecked take a chip. */
function stateChipsOf(vehicleState: VehicleStateReading): CompactChip[] {
  if (vehicleState.mode === 'active') return []
  const title = vehicleState.text
  return [{ id: STATE_CHIP_ID, iconId: vehicleState.icon, title, urgency: 'steady' }]
}

function statusChipsOf(statuses: CombatStatusStack): CompactChip[] {
  return [
    ...statuses.shown.map((status) => ({ ...status, title: compactChipTitleOf(status) })),
    ...statuses.secondary.map((status) => ({
      id: status.id,
      iconId: status.iconId,
      title: compactChipTitleOf(status),
      urgency: 'steady' as const,
    })),
  ].map(({ id, iconId, title, urgency }) => ({ id, iconId, title, urgency }))
}
