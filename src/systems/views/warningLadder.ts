/**
 * The warning ladder's tiers (spec #678, docs/ui/design-system.md section 7): low at 30%,
 * critical at 15% and empty at 0% of what a bounded reading has left (hull and fuel left, cargo
 * room, heat room to the limit). Here only the tier a reading stands in now, which the strip's
 * bars hatch by (#684); firing each tier once on the way in, its re-arm, glow, sound and haptic
 * are the warning layer's (`warningWatch.ts`, ticket 685). The tiers come from the design tokens.
 */
import { DESIGN_TOKENS, type DesignTokens } from './designSystem'

export const LADDER_TIERS = ['low', 'critical', 'empty'] as const

export type LadderTier = 'ok' | (typeof LADDER_TIERS)[number]

const PERMILLE_PER_PERCENT = 10

/** The deepest tier the reading has reached, `ok` above them all; `leftPermille` is 0..1000. */
export function ladderTierOf(
  leftPermille: number,
  tokens: DesignTokens = DESIGN_TOKENS,
): LadderTier {
  const reached = tokens.warningLadder.tiers.filter(
    (tier) => leftPermille <= tier.atPercent * PERMILLE_PER_PERCENT,
  )
  return ladderTierNamed(reached.at(-1)?.name)
}

/** The tier a token names, `ok` for anything else. */
export function ladderTierNamed(name: string | undefined): LadderTier {
  return LADDER_TIERS.find((tier) => tier === name) ?? 'ok'
}
