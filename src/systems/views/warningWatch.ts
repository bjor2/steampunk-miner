/**
 * The warning layer's watch (spec #678, ticket 685; docs/ui/design-system.md section 7): low
 * hull, low fuel, a filling hold, heat and a collapse each warn on the one three-tier ladder. A
 * tier fires once on the way in, as the tier's bell and haptic pulse, and re-arms only once the
 * reading climbs `rearmPercent` above it (G&V); a reading that falls past several tiers at once
 * fires the deepest alone, so one bell rings, never a peal. The edge glow holds the deepest tier
 * any reading stands in now, and the strip pulses that readout's icon. Never a text box: the
 * words stay in the detail behind the gear button. Presentation only: nothing here reaches a
 * rule, the log or the digest.
 */
import type { CombatStatusStack } from './combatStatuses'
import { DESIGN_TOKENS, type DesignTokens } from './designSystem'
import type { HudModel } from './hudModel'
import { hudStripOf, type HudStrip } from './hudStrip'
import { ladderTierNamed, ladderTierOf, LADDER_TIERS, type LadderTier } from './warningLadder'

/** The readouts that warn, in the order a tie for the glow is settled by. */
export const WARNING_READOUT_IDS = ['hull', 'fuel', 'cargo', 'heat', 'collapse'] as const

export type WarningReadoutId = (typeof WARNING_READOUT_IDS)[number]

export type FiringTier = (typeof LADDER_TIERS)[number]

/** What a readout has left, 0..1000: hull and fuel left, cargo room, heat room to the limit. */
export interface WarningReading {
  id: WarningReadoutId
  leftPermille: number
}

/** Per readout, the deepest tier that fired and has not re-armed; `ok` when all are armed. */
export type WarningWatch = Readonly<Record<WarningReadoutId, LadderTier>>

export interface WarningFiring {
  readoutId: WarningReadoutId
  tier: FiringTier
  /** The tier's bell (`soundCues`, `ui.warn.*`). */
  cueId: string
  /** The tier's haptic pulse, felt under the haptics setting (#173). */
  hapticMs: number
}

/** The edge glow: the deepest tier a reading stands in now, and which readout holds it. */
export interface EdgeGlow {
  tier: LadderTier
  readoutId: WarningReadoutId | null
}

export interface WarningStep {
  watch: WarningWatch
  firings: WarningFiring[]
  glow: EdgeGlow
}

export const ARMED_WARNING_WATCH: WarningWatch = {
  hull: 'ok',
  fuel: 'ok',
  cargo: 'ok',
  heat: 'ok',
  collapse: 'ok',
}

export const NO_EDGE_GLOW: EdgeGlow = { tier: 'ok', readoutId: null }

const PERMILLE = 1000
const PERMILLE_PER_PERCENT = 10
const WARN_CUE_PREFIX = 'ui.warn.'

/**
 * A collapse is a yes or no, not a gauge: a block telegraphing near the rig stands at the
 * ladder's critical line, the same tier as a critical hull (both pulse fast, #158), and its end
 * re-arms it at once.
 */
const COLLAPSE_TIER: FiringTier = 'critical'

interface ReadoutStep {
  id: WarningReadoutId
  tier: LadderTier
  firing: WarningFiring | null
}

/** One look at the readings: what fires now, what the watch keeps, what the glow shows. */
export function stepWarningWatch(
  watch: WarningWatch,
  readings: readonly WarningReading[],
  tokens: DesignTokens = DESIGN_TOKENS,
): WarningStep {
  const steps = readings.map((reading) => readoutStepOf(watch[reading.id], reading, tokens))
  return {
    watch: watchAfter(watch, steps),
    firings: firingsOf(steps),
    glow: edgeGlowOf(readings, tokens),
  }
}

/** The strip's bars and heat line, and the collapse status, as the watch reads them. */
export function warningReadingsOf(
  strip: HudStrip,
  statuses: CombatStatusStack,
  tokens: DesignTokens = DESIGN_TOKENS,
): WarningReading[] {
  return [
    ...strip.bars.map((bar) => ({ id: bar.id, leftPermille: bar.leftPermille })),
    { id: 'heat', leftPermille: strip.heat?.leftPermille ?? PERMILLE },
    { id: 'collapse', leftPermille: collapseLeftPermilleOf(isCollapseWarned(statuses), tokens) },
  ]
}

/** The HUD model's readings, read through the strip the bars are drawn from. */
export function hudWarningReadingsOf(model: HudModel): WarningReading[] {
  return warningReadingsOf(hudStripOf(model), model.statuses)
}

/** The deepest tier any reading stands in now; the first readout in order wins a tie. */
export function edgeGlowOf(
  readings: readonly WarningReading[],
  tokens: DesignTokens = DESIGN_TOKENS,
): EdgeGlow {
  return readings.reduce<EdgeGlow>((glow, reading) => {
    const tier = ladderTierOf(reading.leftPermille, tokens)
    return isDeeper(tier, glow.tier) ? { tier, readoutId: reading.id } : glow
  }, NO_EDGE_GLOW)
}

function readoutStepOf(
  fired: LadderTier,
  reading: WarningReading,
  tokens: DesignTokens,
): ReadoutStep {
  const reached = ladderTierOf(reading.leftPermille, tokens)
  const armed = stillFiredTierOf(fired, reading.leftPermille, tokens)
  if (!isDeeper(reached, armed)) return { id: reading.id, tier: armed, firing: null }
  return { id: reading.id, tier: reached, firing: firingOf(reading.id, reached, tokens) }
}

/**
 * The deepest tier, no deeper than the one that fired, whose re-arm line the reading has not
 * climbed past: a tier re-arms once the reading stands `rearmPercent` above it.
 */
function stillFiredTierOf(
  fired: LadderTier,
  leftPermille: number,
  tokens: DesignTokens,
): LadderTier {
  const { tiers, rearmPercent } = tokens.warningLadder
  const held = tiers.filter(
    (tier) =>
      depthOf(tier.name) <= depthOf(fired) &&
      leftPermille <= (tier.atPercent + rearmPercent) * PERMILLE_PER_PERCENT,
  )
  return ladderTierNamed(held.at(-1)?.name)
}

function firingOf(
  id: WarningReadoutId,
  tier: LadderTier,
  tokens: DesignTokens,
): WarningFiring | null {
  const token = tokens.warningLadder.tiers.find((each) => each.name === tier)
  if (token === undefined || tier === 'ok') return null
  return { readoutId: id, tier, cueId: `${WARN_CUE_PREFIX}${tier}`, hapticMs: token.hapticMs }
}

function watchAfter(watch: WarningWatch, steps: readonly ReadoutStep[]): WarningWatch {
  return steps.reduce<WarningWatch>((after, step) => ({ ...after, [step.id]: step.tier }), watch)
}

function firingsOf(steps: readonly ReadoutStep[]): WarningFiring[] {
  return steps.flatMap((step) => (step.firing === null ? [] : [step.firing]))
}

function isCollapseWarned(statuses: CombatStatusStack): boolean {
  return [...statuses.shown, ...statuses.folded].some((status) => status.id === 'collapse')
}

function collapseLeftPermilleOf(isWarned: boolean, tokens: DesignTokens): number {
  if (!isWarned) return PERMILLE
  const tier = tokens.warningLadder.tiers.find((each) => each.name === COLLAPSE_TIER)
  return (tier?.atPercent ?? 0) * PERMILLE_PER_PERCENT
}

function isDeeper(tier: LadderTier, than: LadderTier): boolean {
  return depthOf(tier) > depthOf(than)
}

/** `ok` is 0, then each ladder tier one deeper. */
function depthOf(tier: string): number {
  return LADDER_TIERS.findIndex((each) => each === tier) + 1
}
