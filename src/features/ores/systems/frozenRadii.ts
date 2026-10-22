/**
 * The planet registry's frozen radii (GD lock R1 on #302, 6306854642, with its addendum 6306861669;
 * the row override shape of the GD lock on #707, 6326252575). A row's `radius` is an override of
 * #6's ladder: `tiles` from Systems' R(p) = round(baseTiles + k ln p) with `radiusRule`'s k,
 * generated once and frozen as whole numbers so the game never computes `ln` (TD); `fromOreRules`,
 * the first ore rules version that sizes the planet by it, so a planet a save holds under an older
 * stamp keeps the ladder; and `reason`. k is one shared value inside `lnCoefficientBounds`, never
 * set per planet; retuning it rewrites every row.
 *
 * Radius never decreases within a solar system (VS on #305, 6306854175): a row below the planet
 * before it in the same system is a named exception and says why (`radiusShrinkWhy`); no other row
 * may carry one.
 */
import type { FrozenRadius } from '../../../systems/registries/planetRow'
import { ORE_RULES_VERSION, RADIUS_ROWS_ORE_RULES } from '../../../systems/world/planetParams'

type Raw = Record<string, unknown>

/** What the shrink guard checks the rows against. */
export interface PlanetRowContext {
  /** The solar system a planet sits in (`planets.surfaceLayer.systems`, by first planet). */
  solarSystemOf(planetIndex: number): number
}

const PATH = 'ore.planets'
const RADIUS_FIELDS = ['tiles', 'fromOreRules', 'reason']

/** Why the shared radius rule is not R(p) = round(base + k ln p) with k in its bounds. */
export function radiusRuleProblems(rule: unknown): string[] {
  const raw = isRawMap(rule) ? rule : {}
  const where = `${PATH}.radiusRule`
  const bounds = coefficientBoundsOf(raw.lnCoefficientBounds)
  return [
    ...(isWholeFromOne(raw.baseTiles) ? [] : [`${where}.baseTiles must be a whole number from 1`]),
    ...(bounds === null
      ? [`${where}.lnCoefficientBounds must be [lowest, highest], whole numbers from 1`]
      : coefficientProblems(raw.lnCoefficient, bounds, where)),
  ]
}

/** Why a row's `radius` is not a frozen override: whole tiles, a known ore rules key, a reason. */
export function frozenRadiusProblems(radius: unknown, where: string): string[] {
  if (!isRawMap(radius)) return [`${where}.radius must hold tiles, fromOreRules and a reason`]
  return [
    ...(isWholeFromOne(radius.tiles) ? [] : [`${where}.radius.tiles must be whole, from 1`]),
    ...(isRadiusOreRules(radius.fromOreRules)
      ? []
      : [
          `${where}.radius.fromOreRules must be ore rules ${RADIUS_ROWS_ORE_RULES} to ${ORE_RULES_VERSION}`,
        ]),
    ...(isReason(radius.reason) ? [] : [`${where}.radius.reason must say why`]),
    ...Object.keys(radius)
      .filter((field) => !RADIUS_FIELDS.includes(field))
      .map((field) => `${where}.radius.${field} is not a radius field`),
  ]
}

/** A shrink inside a solar system needs its reason, and a reason needs its shrink. */
export function shrinkProblems(rows: readonly Raw[], context: PlanetRowContext): string[] {
  return rows.slice(1).flatMap((row, before) => {
    const isShrink = isShrinkInSystem(rows[before], row, context)
    const hasReason = row.radiusShrinkWhy !== undefined
    if (isShrink === hasReason) return []
    const where = `${PATH}.rows[${before + 1}]`
    return isShrink
      ? [`${where}.radius.tiles shrinks below planet ${before + 1}'s with no radiusShrinkWhy`]
      : [`${where}.radiusShrinkWhy names a shrink the row does not make`]
  })
}

/** A checked row's radius, typed. */
export function frozenRadiusOf(radius: Raw): FrozenRadius {
  return {
    tiles: radius.tiles as number,
    fromOreRules: radius.fromOreRules as number,
    reason: radius.reason as string,
  }
}

export function isReason(reason: unknown): boolean {
  return typeof reason === 'string' && reason.trim() !== ''
}

function isWholeFromOne(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1
}

function coefficientBoundsOf(bounds: unknown): readonly [number, number] | null {
  if (!Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(isWholeFromOne)) return null
  const [lowest, highest] = bounds as number[]
  return lowest <= highest ? [lowest, highest] : null
}

function coefficientProblems(k: unknown, bounds: readonly [number, number], where: string) {
  const [lowest, highest] = bounds
  const isWithin = isWholeFromOne(k) && k >= lowest && k <= highest
  return isWithin
    ? []
    : [`${where}.lnCoefficient must be a whole number from ${lowest} to ${highest}`]
}

/** A save stamped before the registry radius keeps the ladder, so no row may key on it. */
function isRadiusOreRules(version: unknown): boolean {
  return (
    Number.isSafeInteger(version) &&
    (version as number) >= RADIUS_ROWS_ORE_RULES &&
    (version as number) <= ORE_RULES_VERSION
  )
}

function isShrinkInSystem(previous: Raw, row: Raw, context: PlanetRowContext): boolean {
  const isSameSystem =
    context.solarSystemOf(previous.planet as number) === context.solarSystemOf(row.planet as number)
  return isSameSystem && tilesOf(row) < tilesOf(previous)
}

function tilesOf(row: Raw): number {
  return (row.radius as Raw).tiles as number
}

function isRawMap(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
