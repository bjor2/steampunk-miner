/**
 * The planet card as it draws (ticket 343): each line's tag, arrival line and gate kind as given,
 * and each typed value as its label and short text, the amount through `formatAmount` (#32) and
 * then its unit, so #306's σ_s, V_p and toughness read like every other number on screen.
 */
import { formatAmount } from '../displayAmount'
import type { PlanetCard, PlanetCardLine, PlanetCardValue } from '../registries/planetCardLines'

export interface PlanetCardValueView {
  label: string
  text: string
}

export interface PlanetCardLineView {
  sourceId: string
  tag: string
  arrivalLine: string
  gateKind: string | null
  values: readonly PlanetCardValueView[]
}

export interface PlanetCardView {
  planetIndex: number
  lines: readonly PlanetCardLineView[]
}

export function planetCardViewOf(card: PlanetCard): PlanetCardView {
  return { planetIndex: card.planetIndex, lines: card.lines.map(lineViewOf) }
}

function lineViewOf(line: PlanetCardLine): PlanetCardLineView {
  return { ...line, values: line.values.map(valueViewOf) }
}

function valueViewOf({ label, amount, unit }: PlanetCardValue): PlanetCardValueView {
  const amountText = formatAmount(amount)
  return { label, text: unit === '' ? amountText : `${amountText} ${unit}` }
}
