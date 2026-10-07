/**
 * Which act a planet belongs to and what its seed adds (#141 "Acts", "Per planet", "Endless"):
 * the act names the two commons, the rare and the signature; the planet's seed picks the accent
 * (a callback to an earlier act) and whether band 3 wears the rare. Horizontal: acts, families,
 * the swap and the accent are new things to see, never more value.
 *
 * - `actOf(p)`: the campaign act whose planets hold `p`; from P41 the cycle
 *   `[fire, frost, lodestone, hollow, foothold.heavy]` by `(p - 41) mod 5`.
 * - Accent: a seeded pick from the families of earlier acts (every family in endless), leaving out
 *   `metal`, `crystal`, the planet's own families and any family sharing a `gateClass` with a
 *   common or the rare; earlier signatures weigh ×2. The first mixed act has nothing earlier, so it
 *   has no accent.
 * - Swap: from P4, about one planet in two shows the rare in band 3 instead of its common.
 */
import { hashCell } from '../../../systems/cellRandom'
import { oreFamilies } from '../../ores'
import { THEME_ROWS, type OreAct, type ThemeRows } from './themeRows'

/** What one planet's mix is made of: its act, accent and swap, all fixed by planet and seed. */
export interface PlanetMixPlan {
  planetIndex: number
  act: OreAct
  /** The +2 preview family of band 5; null where the act has nothing earlier to call back. */
  accent: string | null
  isBandThreeSwapped: boolean
  isStoryPlanet: boolean
}

/** Hash streams of the hook's sub-seed: one planet-wide roll each, and the per-patch signature. */
export const MIX_STREAM = { swap: 1, accent: 2, signature: 3 } as const

const BASIS_POINTS = 10000

/** The act holding planet `p` (its `oreThemeId`). */
export function actOf(planetIndex: number, rows: ThemeRows = THEME_ROWS): OreAct {
  if (planetIndex >= rows.endlessFromPlanet) return endlessActOf(planetIndex, rows)
  const act = rows.acts.find(({ lastPlanet }) => planetIndex <= lastPlanet)
  if (act === undefined) throw new RangeError(`no act holds planet ${planetIndex}`)
  return act
}

/** The planet's act, accent, swap and story flag under the mix hook's seed. */
export function planetMixPlanOf(
  planetIndex: number,
  seed: number,
  rows: ThemeRows = THEME_ROWS,
): PlanetMixPlan {
  const act = actOf(planetIndex, rows)
  return {
    planetIndex,
    act,
    accent: pickedAccentOf(accentPoolOf(planetIndex, act, rows), seed),
    isBandThreeSwapped: isBandThreeSwappedOn(planetIndex, seed, rows),
    isStoryPlanet: rows.storyPlanets.includes(planetIndex),
  }
}

/** The accent candidates in catalogue order, each with its draw weight. */
export function accentPoolOf(
  planetIndex: number,
  act: OreAct,
  rows: ThemeRows = THEME_ROWS,
): { family: string; weight: number }[] {
  const earlier = earlierActsOf(planetIndex, rows)
  const signatures = earlier.map((earlierAct) => earlierAct.signature)
  return oreFamilies()
    .map((family) => family.id)
    .filter((family) => earlier.some((earlierAct) => familiesOfAct(earlierAct).includes(family)))
    .filter((family) => isAccentCandidate(family, act, rows))
    .map((family) => ({
      family,
      weight: signatures.includes(family) ? rows.accentSignatureWeight : 1,
    }))
}

/** The families an act shows: its commons, rare and signature. */
export function familiesOfAct(act: OreAct): string[] {
  if (act.commons === null) return []
  return [...act.commons, act.rare, act.signature].filter((family) => family !== null)
}

/** The family's #142 gate class. */
export function gateClassOf(family: string, rows: ThemeRows = THEME_ROWS): string {
  return rows.gateClassByFamily[family]
}

function endlessActOf(planetIndex: number, rows: ThemeRows): OreAct {
  const { endlessCycle, endlessFromPlanet } = rows
  const id = endlessCycle[(planetIndex - endlessFromPlanet) % endlessCycle.length]
  return actNamed(id, rows)
}

function actNamed(id: string, rows: ThemeRows): OreAct {
  const act = rows.acts.find((candidate) => candidate.id === id)
  if (act === undefined) throw new RangeError(`no act "${id}"`)
  return act
}

/** Campaign acts before the planet's own; in endless, every act. */
function earlierActsOf(planetIndex: number, rows: ThemeRows): readonly OreAct[] {
  if (planetIndex >= rows.endlessFromPlanet) return rows.acts
  return rows.acts.filter((act) => act.lastPlanet < planetIndex && act.commons !== null)
}

function isAccentCandidate(family: string, act: OreAct, rows: ThemeRows): boolean {
  return (
    !rows.accentExcludes.includes(family) &&
    !familiesOfAct(act).includes(family) &&
    !takenGateClassesOf(act, rows).includes(rows.gateClassByFamily[family])
  )
}

/** The gate classes of the act's commons and rare, which the accent must not share (#142). */
function takenGateClassesOf(act: OreAct, rows: ThemeRows): string[] {
  const taken = [...(act.commons ?? []), act.rare].filter((family) => family !== null)
  return taken.map((family) => rows.gateClassByFamily[family])
}

function pickedAccentOf(pool: readonly { family: string; weight: number }[], seed: number) {
  const total = pool.reduce((sum, { weight }) => sum + weight, 0)
  if (total === 0) return null
  let roll = hashCell(seed, MIX_STREAM.accent, 0) % total
  for (const { family, weight } of pool) {
    if (roll < weight) return family
    roll -= weight
  }
  return null
}

function isBandThreeSwappedOn(planetIndex: number, seed: number, rows: ThemeRows): boolean {
  if (planetIndex < rows.swapFromPlanet) return false
  return hashCell(seed, MIX_STREAM.swap, 0) % BASIS_POINTS < rows.swapChanceBp
}
