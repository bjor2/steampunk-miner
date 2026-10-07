/**
 * Endless combos (spec #161 section 2): from planet 41, one combo every K planets, at
 * `p = 41 + K j`. Its lane pair is `PAIRS[perm(j mod 10)]`, where `perm` is a fixed permutation
 * seeded by a constant, never the world seed, so every player in a world sees the same offers.
 * Each is the next grade of its pair's template: the template's first appearance is labelled
 * horizontal, each re-grade both. It needs its template's two parents and the grade before it.
 * Generated, never registered; `tech.combo.gen.<p>` is stable because it is a formula of `p`.
 */
import { hashCell } from '../../../systems/cellRandom'
import { comboDepthOf } from './authoredNodes'
import { TECH_LANES, type TechComboTemplate, type TechLane, type TreeNode } from './techNode'
import { TREE_ECONOMY } from './treeEconomy'

const GENERATED_COMBO_PREFIX = 'tech.combo.gen.'

/** The permutation's seed: a constant (#161), named for the spec that fixed it. */
const PAIR_PERMUTATION_SEED = 161

/** The ten lane pairs, each lane before the later ones in `TECH_LANES`. */
export const LANE_PAIRS: readonly (readonly [TechLane, TechLane])[] = TECH_LANES.flatMap(
  (first, index) => TECH_LANES.slice(index + 1).map((second) => [first, second] as const),
)

/** `perm`: the pair of the j-th generated combo is `LANE_PAIRS[PAIR_ORDER[j mod 10]]`. */
export const PAIR_ORDER: readonly number[] = permutationOf(LANE_PAIRS.length)

/** What grading a pair's combos needs to know about the authored tree. */
export interface ComboGrading {
  templateOfPair(pairIndex: number): TechComboTemplate | null
  /** The authored combo node that is grade 1 of this combo item, if there is one. */
  authoredComboOf(itemId: string): TreeNode | null
  slots: ReadonlyMap<string, number>
}

export function generatedComboIdOf(planetIndex: number): string {
  return `${GENERATED_COMBO_PREFIX}${planetIndex}`
}

/** The planet a generated combo id names, or null for any other id. */
export function planetOfGeneratedComboId(nodeId: string): number | null {
  if (!nodeId.startsWith(GENERATED_COMBO_PREFIX)) return null
  const planetText = nodeId.slice(GENERATED_COMBO_PREFIX.length)
  return /^[1-9]\d*$/.test(planetText) ? Number.parseInt(planetText, 10) : null
}

/** Which pair's turn a generated combo planet is; null on a planet that has none. */
export function pairIndexAt(planetIndex: number): number | null {
  const step = comboStepOf(planetIndex)
  return step === null ? null : PAIR_ORDER[step % LANE_PAIRS.length]
}

/** The index of the pair holding these two lanes, in either order; -1 for no such pair. */
export function pairIndexOf(lanes: readonly [TechLane, TechLane]): number {
  return LANE_PAIRS.findIndex(
    ([first, second]) =>
      (first === lanes[0] && second === lanes[1]) || (first === lanes[1] && second === lanes[0]),
  )
}

/** The combo generated on `planetIndex`, or null when none is (off-step, or no template yet). */
export function generatedComboAt(planetIndex: number, grading: ComboGrading): TreeNode | null {
  const pairIndex = pairIndexAt(planetIndex)
  const template = pairIndex === null ? null : grading.templateOfPair(pairIndex)
  if (template === null) return null
  return comboNodeOf(planetIndex, template, grading)
}

/** Every planet up to `planetIndex` a combo is generated on, ascending. */
export function generatedComboPlanetsThrough(planetIndex: number): number[] {
  const { firstGeneratedCombo, comboEvery } = TREE_ECONOMY.cadence
  const planets: number[] = []
  for (let planet = firstGeneratedCombo; planet <= planetIndex; planet += comboEvery) {
    planets.push(planet)
  }
  return planets
}

function comboNodeOf(
  planetIndex: number,
  template: TechComboTemplate,
  grading: ComboGrading,
): TreeNode {
  const previous = previousGradeOf(planetIndex, template, grading)
  const grade = gradeAt(planetIndex, template, grading)
  return {
    id: generatedComboIdOf(planetIndex),
    kind: 'combo',
    lane: 'combo',
    name: template.name,
    unlockTier: planetIndex,
    prereqs: previous === null ? template.parents : [...template.parents, previous],
    unlocks: { itemId: template.unlocks, mark: grade },
    iconId: template.iconId,
    description: template.description,
    label: grade === 1 ? 'horizontal' : 'both',
    costKind: 'combo',
    depthTerm: comboDepthOf(template.parents, grading.slots),
  }
}

/** One past the authored grade, if any, and every earlier turn of the same pair. */
function gradeAt(planetIndex: number, template: TechComboTemplate, grading: ComboGrading) {
  const authoredGrades = grading.authoredComboOf(template.unlocks) === null ? 0 : 1
  return authoredGrades + earlierTurnsOf(planetIndex) + 1
}

/** The node of the grade before: the pair's previous turn, else its authored combo. */
function previousGradeOf(
  planetIndex: number,
  template: TechComboTemplate,
  grading: ComboGrading,
): string | null {
  if (earlierTurnsOf(planetIndex) > 0) return generatedComboIdOf(previousTurnPlanetOf(planetIndex))
  return grading.authoredComboOf(template.unlocks)?.id ?? null
}

function earlierTurnsOf(planetIndex: number): number {
  return Math.floor((comboStepOf(planetIndex) ?? 0) / LANE_PAIRS.length)
}

function previousTurnPlanetOf(planetIndex: number): number {
  return planetIndex - LANE_PAIRS.length * TREE_ECONOMY.cadence.comboEvery
}

/** `j` of `p = 41 + K j`, or null when no combo is generated on `planetIndex`. */
function comboStepOf(planetIndex: number): number | null {
  const { firstGeneratedCombo, comboEvery } = TREE_ECONOMY.cadence
  const offset = planetIndex - firstGeneratedCombo
  return offset >= 0 && offset % comboEvery === 0 ? offset / comboEvery : null
}

/** A Fisher-Yates shuffle of 0..count-1 drawn from the cell hash of the constant seed. */
function permutationOf(count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index)
  for (let index = count - 1; index > 0; index -= 1) {
    const swap = hashCell(PAIR_PERMUTATION_SEED, index, 0) % (index + 1)
    ;[order[index], order[swap]] = [order[swap], order[index]]
  }
  return order
}
