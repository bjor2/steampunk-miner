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
  }
}

function changeTextOf({ delta, deltaPct }: StatLine): string | null {
  const [first, second] = [delta, deltaPct].filter(isGiven).map(signed)
  if (second !== undefined) return `${first} (${second})`
  return first ?? null
}

function isGiven(text: string | undefined): text is string {
  return text !== undefined
}

/** A rise reads "+13", a fall keeps its own minus. */
function signed(text: string): string {
  return text.startsWith('-') ? text : `+${text}`
}
