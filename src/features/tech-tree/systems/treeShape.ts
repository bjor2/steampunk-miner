/**
 * The authored tree's shape test (spec #161 section 1, run in CI): ids are unique and the graph
 * is acyclic; no prerequisite sits deeper than its node; combos come at the research lab's planet
 * or later with prerequisites in exactly two lanes, and only combos cross lanes; extractor nodes
 * have none; at most two capabilities share a planet; every node has an icon that resolves, a
 * flavour line with no digits and a label; the absorbed Schedule C rows agree; every Mark
 * milestone sits at Mark 3, 6 or 9 of its ladder, each pattern at most once (#256).
 *
 * It runs over whatever the lane slices have registered, so it turns on as they land; the
 * cadence check (no gap longer than two planets on P2-P37) waits until all five lanes are in.
 */
import { contentOf } from '../../../systems/registries/content'
import { milestoneProblemsOf } from './markMilestones'
import { absorbedRowProblems, researchLabPlanet } from './scheduleAbsorber'
import { TECH_LANES, type TechNode } from './techNode'

export interface ShapeRules {
  isIconKnown(iconId: string): boolean
  /** The research lab's planet: no combo before it. */
  firstComboPlanet: number
}

const MOST_CAPABILITIES_PER_PLANET = 2
const LONGEST_EMPTY_RUN = 2
const CADENCE_PLANETS = { first: 2, last: 37 } as const
const EXTRACTOR_ITEM = /^rig\./
const DIGIT = /\d/

export function treeShapeProblems(nodes: readonly TechNode[], rules: ShapeRules): string[] {
  return [
    ...duplicateIdProblems(nodes),
    ...prerequisiteProblems(nodes),
    ...cycleProblems(nodes),
    ...comboProblems(nodes, rules.firstComboPlanet),
    ...crossLaneProblems(nodes),
    ...extractorProblems(nodes),
    ...crowdedPlanetProblems(nodes),
    ...cadenceProblems(nodes),
    ...presentationProblems(nodes, rules),
    ...absorbedRowProblems(nodes),
    ...milestoneShapeProblems(nodes),
  ]
}

/** The shape test over the nodes the lane slices registered, the lab's planet from Schedule C. */
export function registeredTreeShapeProblems(isIconKnown: (iconId: string) => boolean): string[] {
  return treeShapeProblems(contentOf('tech-node'), {
    isIconKnown,
    firstComboPlanet: researchLabPlanet(),
  })
}

function duplicateIdProblems(nodes: readonly TechNode[]): string[] {
  const ids = nodes.map((node) => node.id)
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].map(
    (id) => `node id ${id} is registered more than once`,
  )
}

/** Each prerequisite exists and is reachable no later than its node. */
function prerequisiteProblems(nodes: readonly TechNode[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return nodes.flatMap((node) =>
    node.prereqs.flatMap((prereqId) => {
      const prereq = byId.get(prereqId)
      if (prereq === undefined) return [`${node.id} needs ${prereqId}, which no lane registered`]
      return prereq.unlockTier <= node.unlockTier
        ? []
        : [`${node.id} (P${node.unlockTier}) needs ${prereqId}, which opens later`]
    }),
  )
}

function cycleProblems(nodes: readonly TechNode[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return nodes
    .filter((node) => isOnCycle(node.id, byId))
    .map((node) => `${node.id} is its own prerequisite through a cycle`)
}

function isOnCycle(startId: string, byId: ReadonlyMap<string, TechNode>): boolean {
  const seen = new Set<string>()
  const pending = [...(byId.get(startId)?.prereqs ?? [])]
  while (pending.length > 0) {
    const id = pending.pop() as string
    if (id === startId) return true
    if (seen.has(id)) continue
    seen.add(id)
    pending.push(...(byId.get(id)?.prereqs ?? []))
  }
  return false
}

function comboProblems(nodes: readonly TechNode[], firstComboPlanet: number): string[] {
  const laneOf = new Map(nodes.map((node) => [node.id, node.lane]))
  return nodes
    .filter((node) => node.lane === 'combo')
    .flatMap((combo) => [
      ...(combo.unlockTier >= firstComboPlanet
        ? []
        : [`combo ${combo.id} is on P${combo.unlockTier}, before the lab's P${firstComboPlanet}`]),
      ...(lanesOfPrereqs(combo, laneOf).size === 2
        ? []
        : [`combo ${combo.id} needs prerequisites in exactly two lanes`]),
    ])
}

function lanesOfPrereqs(node: TechNode, laneOf: ReadonlyMap<string, string>): Set<unknown> {
  return new Set(node.prereqs.map((id) => laneOf.get(id)))
}

function crossLaneProblems(nodes: readonly TechNode[]): string[] {
  const laneOf = new Map(nodes.map((node) => [node.id, node.lane]))
  return nodes
    .filter((node) => node.lane !== 'combo')
    .filter((node) => node.prereqs.some((id) => laneOf.get(id) !== node.lane))
    .map((node) => `${node.id} needs a node of another lane; only combos cross lanes`)
}

function extractorProblems(nodes: readonly TechNode[]): string[] {
  return nodes
    .filter((node) => EXTRACTOR_ITEM.test(node.unlocks) && node.prereqs.length > 0)
    .map((node) => `extractor node ${node.id} has prerequisites`)
}

function crowdedPlanetProblems(nodes: readonly TechNode[]): string[] {
  const counts = capabilityCountsByPlanet(nodes)
  return [...counts.entries()]
    .filter(([, count]) => count > MOST_CAPABILITIES_PER_PLANET)
    .map(([planet, count]) => `P${planet} brings ${count} capabilities, more than two`)
}

function cadenceProblems(nodes: readonly TechNode[]): string[] {
  if (!TECH_LANES.every((lane) => nodes.some((node) => node.lane === lane))) return []
  const counts = capabilityCountsByPlanet(nodes)
  return emptyRunsOf(counts)
    .filter((run) => run.length > LONGEST_EMPTY_RUN)
    .map((run) => `P${run[0]}-P${run.at(-1)} bring no new capability, more than two planets`)
}

/** The runs of planets on P2-P37 with no capability, each in planet order. */
function emptyRunsOf(counts: ReadonlyMap<number, number>): number[][] {
  const runs: number[][] = [[]]
  for (let planet = CADENCE_PLANETS.first; planet <= CADENCE_PLANETS.last; planet += 1) {
    if (counts.has(planet)) runs.push([])
    else runs[runs.length - 1].push(planet)
  }
  return runs.filter((run) => run.length > 0)
}

function capabilityCountsByPlanet(nodes: readonly TechNode[]): Map<number, number> {
  const counts = new Map<number, number>()
  nodes
    .filter((node) => node.lane !== 'combo')
    .forEach((node) => counts.set(node.unlockTier, (counts.get(node.unlockTier) ?? 0) + 1))
  return counts
}

function presentationProblems(nodes: readonly TechNode[], rules: ShapeRules): string[] {
  return nodes.flatMap((node) => [
    ...(rules.isIconKnown(node.iconId) ? [] : [`${node.id}: icon ${node.iconId} does not resolve`]),
    ...(isPlainFlavourLine(node.description)
      ? []
      : [`${node.id}: the flavour line is empty or has a digit`]),
    ...(node.label.length > 0 ? [] : [`${node.id} has no label`]),
  ])
}

function milestoneShapeProblems(nodes: readonly TechNode[]): string[] {
  return nodes.flatMap((node) =>
    node.marks === undefined
      ? []
      : milestoneProblemsOf(node.marks).map((problem) => `${node.id}: ${problem}`),
  )
}

/** Stat and cost lines are generated (#159), so the flavour line carries no number. */
function isPlainFlavourLine(description: string): boolean {
  return description.length > 0 && !DIGIT.test(description)
}
