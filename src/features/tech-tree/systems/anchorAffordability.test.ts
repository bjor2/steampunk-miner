import { describe, expect, it } from 'vitest'
import { add, fromCanonical, fromSafeInteger, sub, type Money } from '../../../systems/money'
import { withFixtureTree } from '../treeTestSession'
import { earlyAffordableNodesOf, type PlanetEarnings } from './anchorAffordability'
import { nodeCost } from './nodeCost'
import { registeredTechTree } from './techTree'
import type { TreeNode } from './techNode'

const ECHO_SOUNDER = 'tech.sensing.echo_sounder'

function nodeOf(id: string): TreeNode {
  const node = registeredTechTree().authored.find((candidate) => candidate.id === id)
  if (node === undefined) throw new Error(`no node ${id}`)
  return node
}

/** One seed that earned `earned` on `planetIndex`. */
function seedEarning(planetIndex: number, earned: Money): PlanetEarnings[] {
  return [{ planetIndex, earned }]
}

describe('tech tree: each node out of reach before its band (#411, HS point 2)', () => {
  it('passes a node priced above what the bot earned on the planet before its anchor', () => {
    withFixtureTree(() => {
      const echo = nodeOf(ECHO_SOUNDER)
      const less = sub(nodeCost(echo), fromCanonical('0.001'))
      expect(earlyAffordableNodesOf([echo], [seedEarning(echo.unlockTier - 1, less)])).toEqual([])
    })
  })

  it('names a node the bot could have paid for a planet early', () => {
    withFixtureTree(() => {
      const echo = nodeOf(ECHO_SOUNDER)
      const earned = add(nodeCost(echo), fromSafeInteger(1))
      expect(earlyAffordableNodesOf([echo], [seedEarning(echo.unlockTier - 1, earned)])).toEqual([
        {
          nodeId: ECHO_SOUNDER,
          anchor: echo.unlockTier,
          price: nodeCost(echo),
          earnedBefore: earned,
        },
      ])
    })
  })

  it('reads the median seed, and judges no node whose planet before no seed stood on', () => {
    withFixtureTree(() => {
      const echo = nodeOf(ECHO_SOUNDER)
      const before = echo.unlockTier - 1
      const rich = add(nodeCost(echo), fromSafeInteger(1))
      const poor = fromSafeInteger(0)
      const seeds = [
        seedEarning(before, rich),
        seedEarning(before, poor),
        seedEarning(before, poor),
      ]
      expect(earlyAffordableNodesOf([echo], seeds)).toEqual([])
      expect(earlyAffordableNodesOf([echo], [seedEarning(before + 5, rich)])).toEqual([])
    })
  })
})
