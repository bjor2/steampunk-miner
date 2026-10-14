/**
 * The words the passives' HUD panels print (#162 Sensing rows), built here so the markup does not
 * compute: an assay card's family and grade, its lead, unit price and gate; the barometer's hazard
 * and distance; the Diviner's warning (ticket 269). Amounts go through the one display formatter
 * (#32).
 */
import { formatAmount } from '../../../../systems/displayAmount'
import type { AssayReading } from '../assayLens'
import type { DivinerWarning } from '../divinerCone'
import type { BarometerWarning } from '../hazardBarometer'

export interface AssayCardText {
  title: string
  lead: string
  price: string
  /** The gate's need, or null for a cell the drill takes as it is. */
  gate: string | null
}

const GATE_WORDS: Readonly<Record<string, string>> = {
  rig: 'needs extractor',
  dynamite: 'needs dynamite',
  drillSignature: 'needs drill tier',
  dense: 'too dense',
}

const HAZARD_WORDS: Readonly<Record<BarometerWarning['hazard'], string>> = {
  lava: 'Lava',
  collapse: 'Weak lining',
}

export function assayCardTextOf(reading: AssayReading): AssayCardText {
  return {
    title: `${reading.family} G${reading.grade}`,
    lead: leadTextOf(reading.lead),
    price: formatAmount(reading.unitPrice),
    gate: GATE_WORDS[reading.gate] ?? null,
  }
}

/** "Lava 2 ahead": the nearest warning, in cells from the drill's nose. */
export function barometerTextOf(warning: BarometerWarning): string {
  return `${HAZARD_WORDS[warning.hazard]} ${warning.cellsAhead} ahead`
}

/** "Collapse ahead", "Collapse held" while a brace holds it, or "Enemy ahead". */
export function divinerTextOf(warning: DivinerWarning): string {
  if (warning.kind === 'enemy') return 'Enemy ahead'
  return warning.ticksLeft === null ? 'Collapse held' : 'Collapse ahead'
}

/** Tiers above its band's ore, signed; a patch spilled upward reads below zero. */
function leadTextOf(lead: number): string {
  return lead > 0 ? `+${lead}` : `${lead}`
}
