/**
 * The grade ladder of #151: five grades, each adding one channel and keeping the ones below
 * (G1 form, G2 sheen, G3 structure, G4 inner light, G5 its own effect). Grade comes from the
 * tier on the kernel's `oreGrades` thresholds. Strength inside a grade (glow, sparkle,
 * saturation) rises with the position in the grade, so band 5 reads stronger than band 1 of the
 * same grade; G5 ramps from its first tier to the visual echo's first tier and then stays flat.
 * The visual echo is the endless counter past G5: one countable ring every `everyTiers` tiers
 * from `fromTier` (P33, then every 8 planets), and from the ring past `ringsMax` a cycle of G5
 * effect variants. It is visual only, separate from #140's economic echo.
 */
import { ART_DIRECTION } from '../../../systems/render/artDirection'
import { oreGradeOf } from '../../../systems/render/oreGrade'
import { ORE_GRADE_COUNT, ORE_LOOKS, type OreLooks } from './oreFamilyLooks'

export const ORE_GRADE_CHANNELS = ['form', 'sheen', 'structure', 'innerLight', 'ownEffect'] as const

export type OreGradeChannel = (typeof ORE_GRADE_CHANNELS)[number]

export interface VisualEcho {
  echo: number
  /** Orbiting arc rings, emission only: echoes 1 to `ringsMax`. */
  rings: number
  /** The G5 effect variant in play from the echo past the last ring, else null. */
  effectVariant: string | null
}

const FIRST_TIER = 1
const LAST_GRADE = ORE_GRADE_COUNT

/** The channels an ore of this grade shows: every channel up to its own. */
export function oreGradeChannelsOf(grade: number): readonly OreGradeChannel[] {
  return ORE_GRADE_CHANNELS.slice(0, clampGrade(grade))
}

/** Position in the grade, 0 at its first tier and 1 at the last tier before the next grade. */
export function oreStrengthOf(tier: number, looks: OreLooks = ORE_LOOKS): number {
  const grade = oreGradeOf(tier)
  const first = grade === 1 ? FIRST_TIER : ART_DIRECTION.oreGrades[grade - 2]
  const next = grade === LAST_GRADE ? looks.visualEcho.fromTier : ART_DIRECTION.oreGrades[grade - 1]
  return clampUnit((tier - first) / (next - first))
}

/** The grade's glow, from `strengthFloor` of it at the grade's first tier to all of it. */
export function oreGlowOf(
  tier: number,
  grade = oreGradeOf(tier),
  looks: OreLooks = ORE_LOOKS,
): number {
  const { glow, strengthFloor } = looks.grades
  const strength = strengthFloor + (1 - strengthFloor) * oreStrengthOf(tier, looks)
  return glow[clampGrade(grade) - 1] * strength
}

export function oreSparklesOf(grade: number, looks: OreLooks = ORE_LOOKS): number {
  return looks.grades.sparkles[clampGrade(grade) - 1]
}

/** Particles one mining hit throws, by grade; the pool caps the live count. */
export function oreHitParticlesOf(grade: number, looks: OreLooks = ORE_LOOKS): number {
  return looks.grades.hitParticles[clampGrade(grade) - 1]
}

export function visualEchoOf(tier: number, looks: OreLooks = ORE_LOOKS): VisualEcho {
  const { fromTier, everyTiers, ringsMax, effectVariants } = looks.visualEcho
  const echo = tier < fromTier ? 0 : Math.floor((tier - fromTier) / everyTiers) + 1
  const pastRings = echo - ringsMax
  return {
    echo,
    rings: Math.min(ringsMax, echo),
    effectVariant: pastRings > 0 ? effectVariants[(pastRings - 1) % effectVariants.length] : null,
  }
}

function clampGrade(grade: number): number {
  return Math.min(LAST_GRADE, Math.max(1, Math.floor(grade)))
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}
