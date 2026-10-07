/**
 * The tree screen's model (spec #161 section 4): five swimlanes and the combo row on a planet
 * ruler, the x-axis being `unlockTier`, so a node's place says when and its lane says what kind.
 * A lane no slice has registered yet shows "coming soon". The "next up" strip holds each lane's
 * first node the player can research; search matches a node's name, item or flavour line; the
 * filters keep available, affordable, locked or Mark-ready nodes. Marks stay on their item's chip.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { formatAmount } from '../../../systems/displayAmount'
import { generatedComboAt, generatedComboPlanetsThrough } from './generatedCombos'
import { cardContextOf, nodeCardOf, type NodeCardModel } from './nodeCardModel'
import { treeNodeOf, unlockAllPlanetOf, type TechTree } from './techTree'
import { TECH_LANES, type TechNodeLane, type TreeNode } from './techNode'
import { TREE_ECONOMY } from './treeEconomy'

export const TREE_FILTERS = ['available', 'affordable', 'locked', 'marks'] as const

export type TreeFilter = (typeof TREE_FILTERS)[number]

export interface TreeQuery {
  search: string
  /** None kept means every node; several keep a node any of them keeps. */
  filters: readonly TreeFilter[]
}

/** A card on its lane, `stack` counting the cards before it on the same planet. */
export interface PlacedNode extends NodeCardModel {
  stack: number
}

export interface LaneModel {
  lane: TechNodeLane
  title: string
  /** No slice has registered a node for it yet. */
  isComingSoon: boolean
  nodes: readonly PlacedNode[]
}

export interface TreeScreenModel {
  planetIndex: number
  walletText: string
  /** The ruler runs from planet 1 to here. */
  lastPlanet: number
  rulerMarks: readonly number[]
  lanes: readonly LaneModel[]
  nextUp: readonly NodeCardModel[]
}

export const SCREEN_LANES: readonly TechNodeLane[] = [...TECH_LANES, 'combo']

/** "Extractors", never "rig": the Guild calls the vehicle the rig (#161). */
export const LANE_TITLES: Readonly<Record<TechNodeLane, string>> = {
  extraction: 'Extractors',
  terrain: 'Terrain',
  sensing: 'Sensing',
  mobility: 'Mobility',
  'drill-gear': 'Drill gear',
  combo: 'Combos',
}

const RULER_MARK_EVERY = 5

export function treeScreenModelOf(
  state: AuthorityState,
  playerId: string,
  tree: TechTree,
  query: TreeQuery,
): TreeScreenModel {
  const context = cardContextOf(state, playerId, tree)
  const lastPlanet = rulerEndOf(tree, state.planet.index)
  const cards = mapNodesOf(tree, lastPlanet).map((node) => nodeCardOf(node, context))
  return {
    planetIndex: state.planet.index,
    walletText: formatAmount(state.players[playerId].wallet),
    lastPlanet,
    rulerMarks: rulerMarksThrough(lastPlanet),
    lanes: SCREEN_LANES.map((lane) => laneModelOf(lane, cards, query)),
    nextUp: SCREEN_LANES.flatMap((lane) => nextUpOf(lane, cards)),
  }
}

/** One node's card, for the card zoom; null for an id no node has. */
export function nodeCardModelOf(
  state: AuthorityState,
  playerId: string,
  tree: TechTree,
  nodeId: string,
): NodeCardModel | null {
  const node = treeNodeOf(tree, nodeId)
  return node === null ? null : nodeCardOf(node, cardContextOf(state, playerId, tree))
}

/** The lane's model; the first lane for a lane the screen does not draw. */
export function shownLaneOf(model: TreeScreenModel, lane: TechNodeLane): LaneModel {
  return model.lanes.find((candidate) => candidate.lane === lane) ?? model.lanes[0]
}

export function isKeptByQuery(card: NodeCardModel, query: TreeQuery): boolean {
  return matchesSearch(card, query.search) && passesFilters(card, query.filters)
}

/** The deepest authored node, or a combo turn past the session's planet, whichever is further. */
function rulerEndOf(tree: TechTree, planetIndex: number): number {
  return Math.max(
    unlockAllPlanetOf(tree, planetIndex),
    planetIndex + TREE_ECONOMY.cadence.comboEvery,
  )
}

function rulerMarksThrough(lastPlanet: number): number[] {
  const marks = [1]
  for (let planet = RULER_MARK_EVERY; planet <= lastPlanet; planet += RULER_MARK_EVERY) {
    marks.push(planet)
  }
  return marks
}

/** The nodes drawn on the map: authored ones and the endless combos; Marks ride on chips. */
function mapNodesOf(tree: TechTree, lastPlanet: number): TreeNode[] {
  const generated = generatedComboPlanetsThrough(lastPlanet).flatMap(
    (planet) => generatedComboAt(planet, tree.grading) ?? [],
  )
  return [...tree.authored, ...generated]
}

function laneModelOf(
  lane: TechNodeLane,
  cards: readonly NodeCardModel[],
  query: TreeQuery,
): LaneModel {
  const laneCards = cards.filter((card) => card.lane === lane)
  return {
    lane,
    title: LANE_TITLES[lane],
    isComingSoon: laneCards.length === 0,
    nodes: stackedOnPlanets(laneCards.filter((card) => isKeptByQuery(card, query))),
  }
}

function stackedOnPlanets(cards: readonly NodeCardModel[]): PlacedNode[] {
  return cards.map((card, index) => ({
    ...card,
    stack: cards.slice(0, index).filter((before) => before.tier === card.tier).length,
  }))
}

function nextUpOf(lane: TechNodeLane, cards: readonly NodeCardModel[]): NodeCardModel[] {
  const next = cards.find((card) => card.lane === lane && isResearchable(card))
  return next === undefined ? [] : [next]
}

function isResearchable(card: NodeCardModel): boolean {
  return card.status === 'affordable' || card.status === 'available'
}

function matchesSearch(card: NodeCardModel, search: string): boolean {
  const words = search.trim().toLowerCase()
  if (words.length === 0) return true
  return [card.name, card.itemId, card.description].some((text) =>
    text.toLowerCase().includes(words),
  )
}

function passesFilters(card: NodeCardModel, filters: readonly TreeFilter[]): boolean {
  return filters.length === 0 || filters.some((filter) => FILTER_KEEPS[filter](card))
}

const FILTER_KEEPS: Readonly<Record<TreeFilter, (card: NodeCardModel) => boolean>> = {
  available: isResearchable,
  affordable: (card) => card.status === 'affordable',
  locked: (card) => card.status === 'locked',
  marks: (card) => (card.markChip?.next ?? null) !== null,
}
