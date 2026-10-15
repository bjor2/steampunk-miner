/**
 * The item card's text from a description (K7 #199): each stat line's change, next major and cap
 * as the card prints them, so the markup only places strings. The values arrive formatted by the
 * describer (`formatAmount`, `formatPercent`); this adds the signs and the joining words only, the
 * same on every surface (#159 section 3 rule 3).
 */
import type { ItemDescription, StatLine } from '../registries/itemDescriber'
import type { TrackKind } from '../economy/trackKind'

export interface ItemCardLineText {
  label: string
  kind: TrackKind
  now: string
  next: string | null
  /** "+13 (+22.5%)": the delta and its share, as far as the line has them. */
  change: string | null
  /** "Next major in 3: 1.20e6" on a two-tier track. */
  major: string | null
  /** "Cap 14, 12.5% to go" on a saturating track. */
  cap: string | null
  /**
   * The major and the cap in a compact tooltip's words, "major in 3: 1.20e6, cap 14 (12.5% to
   * go)" (GD ruling on #425): the same values, fewer words; null when the line has neither.
   */
  caveat: string | null
}

export interface ItemCardText {
  lines: readonly ItemCardLineText[]
  flavour: string
  unlock: string | null
  gateNote: string | null
}

export function itemCardTextOf(description: ItemDescription): ItemCardText {
  return {
    lines: description.statLines.map(lineTextOf),
    flavour: description.flavour,
    unlock: description.unlock ?? null,
    gateNote: description.gateNote ?? null,
  }
}

function lineTextOf(line: StatLine): ItemCardLineText {
  return {
    label: line.label,
    kind: line.kind,
    now: line.now,
    next: line.next ?? null,
    change: changeTextOf(line),
    major:
      line.major === undefined ? null : `Next major in ${line.major.levelsTo}: ${line.major.value}`,
    cap: line.cap === undefined ? null : `Cap ${line.cap.value}, ${line.cap.headroomPct} to go`,
    caveat: caveatOf(line),
  }
}

function caveatOf({ major, cap }: StatLine): string | null {
  const parts = [
    major === undefined ? null : `major in ${major.levelsTo}: ${major.value}`,
    cap === undefined ? null : `cap ${cap.value} (${cap.headroomPct} to go)`,
  ].filter(isGiven)
  return parts.length === 0 ? null : parts.join(', ')
}

function changeTextOf({ delta, deltaPct }: StatLine): string | null {
  const [first, second] = [delta, deltaPct].filter(isGiven).map(signed)
  if (second !== undefined) return `${first} (${second})`
  return first ?? null
}

function isGiven(text: string | null | undefined): text is string {
  return text !== undefined && text !== null
}

/** A rise reads "+13", a fall keeps its own minus. */
function signed(text: string): string {
  return text.startsWith('-') ? text : `+${text}`
}
