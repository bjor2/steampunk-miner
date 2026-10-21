/**
 * The HUD strip (spec #678, ticket 684; docs/ui/design-system.md sections 9 and 12) as a pure
 * view of the HUD model: one thin top box of three fraction-only gauge bars (hull, fuel, cargo),
 * the heat line along its foot only above 60%, and one number: the money on the surface, with the next-upgrade
 * chip beside it, and the depth underground, where it is the only number. Speed is never on the
 * strip. The edge gauge beside it is the way from the surface to the core, with no number. Every
 * exact value and word sits in the detail behind the gear button.
 */
import { formatAmount, formatPrice } from '../displayAmount'
import { cmp, fromCanonical, sub } from '../money'
import { DESIGN_TOKENS, type DesignTokens } from './designSystem'
import type { GaugeReading, HudModel } from './hudModel'
import type { NextUpgradeChip } from './nextUpgradeChip'
import { ladderTierOf, type LadderTier } from './warningLadder'

export type StripBarId = 'hull' | 'fuel' | 'cargo' | 'heat'

/** A brass gauge bar: its fill and the ladder tier it is hatched by, never a number. */
export interface StripBar {
  id: StripBarId
  iconId: string
  /** The fill, 0..1000. */
  fillPermille: number
  /** The tier of what the bar has left: hull and fuel left, cargo room, heat room. */
  tier: LadderTier
}

export type StripNumber =
  { kind: 'money'; text: string; exact: string } | { kind: 'depth'; text: string; exact: string }

export interface HudStrip {
  bars: readonly StripBar[]
  /** The heat line along the strip's foot, above 60% of the gauge only; null below or off it. */
  heat: StripBar | null
  number: StripNumber
  /** On the surface and at the dock only (GD ruling 21 Oct 18:33); null underground. */
  nextUpgrade: NextUpgradeChip | null
  /** The rig's mark on the edge gauge: 0 at the surface, 1000 at the core's edge. */
  edgePermille: number
}

export interface MoneyChange {
  text: string
  isGain: boolean
}

const PERMILLE = 1000
const PERMILLE_PER_PERCENT = 10
/** One tile is one metre (#7), so the depth in tiles is the depth in metres. */
const METRES_PER_KM = 1000
const DECIMAL_BASE = 10

export function hudStripOf(model: HudModel, tokens: DesignTokens = DESIGN_TOKENS): HudStrip {
  const isOnSurface = isOnSurfaceOf(model)
  return {
    bars: stripBarsOf(model, tokens),
    heat: heatLineOf(model.heat, tokens),
    number: isOnSurface ? moneyNumberOf(model) : depthNumberOf(model, tokens),
    nextUpgrade: isOnSurface ? model.nextUpgrade : null,
    edgePermille: edgePermilleOf(model.depth.depthTiles, model.coreDistance),
  }
}

/** On the surface (or above it, or docked) the depth is 0; one tile down is underground. */
export function isOnSurfaceOf(model: HudModel): boolean {
  return model.depth.depthTiles === 0
}

/** Metres up to `depthKmFromMetres`, then km cut to `depthKmDecimals` (design section 12). */
export function depthStripTextOf(metres: number, tokens: DesignTokens = DESIGN_TOKENS): string {
  const { depthKmFromMetres, depthKmDecimals } = tokens.numbers
  if (metres < depthKmFromMetres) return `${formatAmount(metres)} m`
  return `${kilometresTextOf(metres, depthKmDecimals)} km`
}

/** How far down the rig is from the surface to the core's edge, 0..1000. */
export function edgePermilleOf(depthTiles: number, coreDistance: number | null): number {
  const toCore = depthTiles + (coreDistance ?? 0)
  if (depthTiles <= 0 || toCore <= 0) return 0
  return Math.min(PERMILLE, Math.floor((depthTiles * PERMILLE) / toCore))
}

/**
 * The float-up beside the money when it changes (design section 6): a gain rounded down as a
 * balance is, a spend rounded up as a price is; null when nothing changed.
 */
export function moneyChangeOf(previousExact: string, nextExact: string): MoneyChange | null {
  const previous = fromCanonical(previousExact)
  const next = fromCanonical(nextExact)
  const way = cmp(next, previous)
  if (way === 0) return null
  if (way > 0) return { text: `+${formatAmount(sub(next, previous))}`, isGain: true }
  return { text: `-${formatPrice(sub(previous, next))}`, isGain: false }
}

function stripBarsOf(model: HudModel, tokens: DesignTokens): StripBar[] {
  const { hull, energy, cargo } = model
  return [
    barOf('hull', hull, hull.permille, tokens),
    barOf('fuel', energy, energy.permille, tokens),
    barOf('cargo', cargo, PERMILLE - cargo.permille, tokens),
  ]
}

function heatLineOf(heat: GaugeReading | null, tokens: DesignTokens): StripBar | null {
  if (heat === null || !isHeatShown(heat.permille, tokens)) return null
  return barOf('heat', heat, PERMILLE - clampPermille(heat.permille), tokens)
}

function barOf(
  id: StripBarId,
  reading: GaugeReading,
  leftPermille: number,
  tokens: DesignTokens,
): StripBar {
  return {
    id,
    iconId: reading.iconId,
    fillPermille: clampPermille(reading.permille),
    tier: ladderTierOf(clampPermille(leftPermille), tokens),
  }
}

/** GD lock: the heat shows only above 60% of its gauge. */
function isHeatShown(permille: number, tokens: DesignTokens): boolean {
  return permille > tokens.layout.strip.heatShowsAbovePercent * PERMILLE_PER_PERCENT
}

function moneyNumberOf(model: HudModel): StripNumber {
  return { kind: 'money', text: model.money.text, exact: model.money.exact }
}

function depthNumberOf(model: HudModel, tokens: DesignTokens): StripNumber {
  const { depthTiles } = model.depth
  return { kind: 'depth', text: depthStripTextOf(depthTiles, tokens), exact: String(depthTiles) }
}

/** Whole kilometres, a point and the decimals, cut toward zero; integers only, no float. */
function kilometresTextOf(metres: number, decimals: number): string {
  const whole = Math.floor(metres / METRES_PER_KM)
  if (decimals <= 0) return String(whole)
  const step = METRES_PER_KM / DECIMAL_BASE ** decimals
  const fraction = Math.floor((metres % METRES_PER_KM) / step)
  return `${whole}.${String(fraction).padStart(decimals, '0')}`
}

function clampPermille(permille: number): number {
  return Math.max(0, Math.min(PERMILLE, permille))
}
