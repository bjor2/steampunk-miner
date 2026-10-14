/**
 * The Horizontal Scaler's point 2 on #411: with money the only gate, a node's price must still keep
 * it out of reach before its band on the pacing bot's curve, so "priced to arrive around Pn" holds.
 * A node anchored on planet P (from P2) passes when its price is above what the pacing bot earned
 * over its whole stay on planet P - 1, on the median of the seeds that stood there: a player who
 * spent a planet's income on nothing else could still not buy it a planet early. A node whose
 * planet before no seed stood on is not judged.
 */
import { cmp, type Money } from '../../../systems/money'
import { nodeCost } from './nodeCost'
import type { TreeNode } from './techNode'

const FIRST_JUDGED_ANCHOR = 2

/** One planet of one seed's run: the money the bot earned there. */
export interface PlanetEarnings {
  planetIndex: number
  earned: Money
}

/** A node the bot could have paid for on the planet before its anchor. */
export interface EarlyAffordableNode {
  nodeId: string
  anchor: number
  price: Money
  /** The seeds' median earnings on planet `anchor - 1`. */
  earnedBefore: Money
}

/** Every node priced within the bot's median earnings on the planet before its anchor. */
export function earlyAffordableNodesOf(
  nodes: readonly TreeNode[],
  seeds: readonly (readonly PlanetEarnings[])[],
): EarlyAffordableNode[] {
  return nodes.flatMap((node) => earlyAffordableOf(node, seeds) ?? [])
}

function earlyAffordableOf(
  node: TreeNode,
  seeds: readonly (readonly PlanetEarnings[])[],
): EarlyAffordableNode | null {
  const earnedBefore = medianEarnedOn(seeds, node.unlockTier - 1)
  if (node.unlockTier < FIRST_JUDGED_ANCHOR || earnedBefore === null) return null
  const price = nodeCost(node)
  if (cmp(price, earnedBefore) > 0) return null
  return { nodeId: node.id, anchor: node.unlockTier, price, earnedBefore }
}

/** The median of what the seeds that stood on `planetIndex` earned there; null with none. */
function medianEarnedOn(
  seeds: readonly (readonly PlanetEarnings[])[],
  planetIndex: number,
): Money | null {
  const earned = seeds
    .flatMap((planets) => planets.filter((planet) => planet.planetIndex === planetIndex))
    .map((planet) => planet.earned)
    .sort(cmp)
  return earned[Math.floor(earned.length / 2)] ?? null
}
