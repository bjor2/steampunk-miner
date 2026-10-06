/**
 * The hint and transmission plaques (#16, #2 stubs) as a pure view of the two boards: the lines
 * of the one hint and the one transmission up, with every `{actionId}` printed as the key bound to
 * it now (#33), so rebinding changes the text at once, and the energy hint's tow cost printed by
 * the one display formatter (#32). Also whether the platform highlights "Sell, repair and
 * recharge", which it does while `hint_dock` is up (#16: the first visit).
 */
import { TRANSMISSION_ICON_ID } from '../art/icons/iconSet'
import { formatAmount } from '../displayAmount'
import { isHintShown, hintDefOf, type HintBoard, type ShownHint } from '../hints/hintBoard'
import { DOCK_HINT_ID, HINT_TABLE, type HintTable } from '../hints/hintTable'
import type { TransmissionBoard } from '../hints/transmissionBoard'
import { boundLabel, isActionId, type Bindings } from '../input/actionMap'
import { fromCanonical } from '../money'

export interface PlaqueSources {
  hintBoard: HintBoard
  transmissionBoard: TransmissionBoard
  bindings: Bindings
  /** The "Show hints" setting and the scenario's `hintsEnabled` both allow hints. */
  isShowingHints: boolean
  /** A scenario run shows no transmission either (#16: tests stay unaffected). */
  isShowingTransmissions: boolean
}

export interface PlaqueReading {
  id: string
  /** The hint's icon from the table, or the transmission glyph (#158). */
  iconId: string
  lines: string[]
}

export interface PlaqueModel {
  hint: PlaqueReading | null
  transmission: PlaqueReading | null
}

const PLACEHOLDER = /\{([^}]*)\}/g

export function selectPlaqueModel(
  sources: PlaqueSources,
  table: HintTable = HINT_TABLE,
): PlaqueModel {
  return {
    hint: hintReadingOf(sources, table),
    transmission: transmissionReadingOf(sources, table),
  }
}

/** "Sell, repair and recharge" is highlighted while the dock hint is up. */
export function isQuickServiceHighlighted(
  sources: Pick<PlaqueSources, 'hintBoard' | 'isShowingHints'>,
): boolean {
  return sources.isShowingHints && isHintShown(sources.hintBoard, DOCK_HINT_ID)
}

function hintReadingOf(sources: PlaqueSources, table: HintTable): PlaqueReading | null {
  const shown = sources.hintBoard.shown
  if (shown === null || !sources.isShowingHints) return null
  const hint = hintDefOf(table, shown.id)
  const lines = hintLinesOf(shown, table)
  return {
    id: shown.id,
    iconId: hint.iconId,
    lines: lines.map((line) => fillLine(line, sources.bindings, shown)),
  }
}

/** After a tow the energy hint says what it cost, when the table has those lines. */
function hintLinesOf(shown: ShownHint, table: HintTable): readonly string[] {
  const hint = hintDefOf(table, shown.id)
  return shown.rescueCost !== null && hint.afterRescueLines !== undefined
    ? hint.afterRescueLines
    : hint.lines
}

function transmissionReadingOf(sources: PlaqueSources, table: HintTable): PlaqueReading | null {
  const shown = sources.transmissionBoard.shown
  if (shown === null || !sources.isShowingTransmissions) return null
  const transmission = table.transmissions.find((entry) => entry.id === shown)
  if (transmission === undefined) return null
  return {
    id: shown,
    iconId: TRANSMISSION_ICON_ID,
    lines: transmission.lines.map((line) => fillLine(line, sources.bindings)),
  }
}

function fillLine(line: string, bindings: Bindings, shown?: ShownHint): string {
  return line.replace(PLACEHOLDER, (_match, name: string) => placeholderText(name, bindings, shown))
}

function placeholderText(name: string, bindings: Bindings, shown?: ShownHint): string {
  if (isActionId(name)) return boundLabel(bindings, name)
  const cost = shown?.rescueCost
  if (cost === null || cost === undefined) return ''
  return formatAmount(fromCanonical(name === 'fee' ? cost.fee : cost.cargoLostValue))
}
