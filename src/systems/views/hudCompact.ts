/**
 * The strip's status row (#500, GD ruling 4; TD shape 4.2; on the strip since ticket 684): at
 * most `MOST_STATUSES_SHOWN` chips on a phone and six on desktop (`layout.statusIcons`, ticket
 * 685), each an icon and a title of at most two words. The vehicle state is its icon alone while
 * under way and a one-word chip otherwise; a combat status or a secondary one (cargo full, the
 * tow) is a chip in priority order; the rest fold into a "+N" count. A chip is its icon and the
 * number its title carries (#486), its words in the strip's detail behind the gear button.
 * Display only: the same model the detail draws, read the compact way. Held upright the threats
 * are chips in the rows, since a marker at the screen's edge sits where the vehicle leans.
 */
import { MOST_STATUSES_SHOWN, type CombatStatusStack, type StatusUrgency } from './combatStatuses'
import { DESIGN_TOKENS, layoutKindOf, type DesignTokens } from './designSystem'
import { calloutTextOf } from './hudCallouts'
import type { VehicleStateReading } from './hudReadings'
import type { HudDensity, StageOrientation } from './screenLayout'
import { wordCountOf } from './uiTextBudget'
import type { UiText } from './uiText'

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

/** A word of a title that holds a number: "x2", "0.5s", "10s". */
const NUMBER_WORD = /\S*\d\S*/g

/**
 * `chipsMax` is the row's room: `MOST_STATUSES_SHOWN` (3) on a phone, six on desktop
 * (`layout.statusIcons`, ticket 685), filled in the same priority order past the stack's three.
 */
export function compactStatusRowOf(
  statuses: CombatStatusStack,
  vehicleState: VehicleStateReading,
  chipsMax: number = MOST_STATUSES_SHOWN,
): CompactStatusRow {
  const candidates = [...stateChipsOf(vehicleState), ...statusChipsOf(statuses)]
  return {
    stateMode: vehicleState.mode,
    stateIconId: vehicleState.icon,
    chips: candidates.slice(0, chipsMax),
    hiddenCount: Math.max(0, candidates.length - chipsMax),
  }
}

/** How many status icons the strip's row has room for in this layout (design section 10). */
export function statusIconsMaxOf(
  density: HudDensity,
  tokens: DesignTokens = DESIGN_TOKENS,
): number {
  return tokens.layout.statusIcons.count[layoutKindOf(density)]
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
    ...[...statuses.shown, ...statuses.folded].map((status) => ({
      ...status,
      title: compactChipTitleOf(status),
    })),
    ...statuses.secondary.map((status) => ({
      id: status.id,
      iconId: status.iconId,
      title: compactChipTitleOf(status),
      urgency: 'steady' as const,
    })),
  ].map(({ id, iconId, title, urgency }) => ({ id, iconId, title, urgency }))
}
