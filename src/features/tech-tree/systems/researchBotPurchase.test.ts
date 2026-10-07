import { describe, expect, it } from 'vitest'
import { dockSiteOfPlanet } from '../../../systems/authority/planetOfState'
import { buyUpgrades, type ShoppingSituation } from '../../../systems/bot/botShopping'
import type { BotSession } from '../../../systems/bot/botSession'
import { paramsOfSession } from '../../../systems/bot/botWorld'
import { newMineLayout } from '../../../systems/bot/mineLayout'
import { spendShareByPlanet } from '../../../systems/bot/shopSpend'
import { cmp, ZERO_MONEY } from '../../../systems/money'
import { TREE_SHOP_FIXTURE_SLICE } from '../treeFixtureSlice'
import { PLAYER, sessionOnPlanet, withFixtureTree, withNoLanes } from '../treeTestSession'
import { unlocksSomethingToBuy } from './itemShop'
import { registeredTechTree } from './techTree'
import { researchOrderOf } from './researchBotPurchase'
import { unlockedNodeIdsOf } from './techTreeSection'
import { availableNodes } from './unlockRules'

function botAtUpgradeBay(planetIndex: number, wallet: string): BotSession {
  const session = sessionOnPlanet(planetIndex, wallet)
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

function situationOf(session: BotSession): ShoppingSituation {
  const site = dockSiteOfPlanet(session.state().planet)!
  return {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    isCoreTheGoal: false,
    gunPolicy: 'never',
    hasMetBlastTile: false,
    restockSize: 1,
    chainPolicy: 'click',
  }
}

/** The fixture tree with its items on sale, so the research filter (ticket 248) lets nodes through. */
const withShop = <T>(run: () => T) => withFixtureTree(run, [TREE_SHOP_FIXTURE_SLICE])

describe('tech tree: the pacing bot researches', () => {
  it('researches nodes through the purchase seam after its own Upgrade bay purchases', () => {
    withShop(() => {
      const session = botAtUpgradeBay(6, '1e12')
      buyUpgrades(session, situationOf(session))
      const types = session.commands().map((command) => command.type)
      expect(types.lastIndexOf('buyUpgrade')).toBeLessThan(types.indexOf('tech-tree.unlock_node'))
      expect(unlockedNodeIdsOf(session.state(), PLAYER)).toContain('tech.sensing.echo_sounder')
      const left = availableNodes(session.state(), PLAYER)
      expect(left.filter((node) => unlocksSomethingToBuy(session.state(), PLAYER, node))).toEqual(
        [],
      )
    })
  })

  it("puts the tree's spend in the spend-share diagnostic", () => {
    withShop(() => {
      const session = botAtUpgradeBay(6, '1e12')
      const [planet] = spendShareByPlanet(buyUpgrades(session, situationOf(session)))
      expect(planet.planetIndex).toBe(6)
      expect(cmp(planet.sliceSpend, ZERO_MONEY)).toBe(1)
    })
  })

  it('sends only nodes the tree accepts: no refusal on the log', () => {
    withShop(() => {
      const session = botAtUpgradeBay(9, '1e12')
      buyUpgrades(session, situationOf(session))
      expect(session.events().some((event) => event.type === 'tech-tree.TechNodeRefused')).toBe(
        false,
      )
    })
  })

  it('tries something new before one more Mark, each cheapest first', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(9)
      session.submit({ type: 'debug.tech-tree.unlockThrough', payload: { planetIndex: 4 } })
      const order = researchOrderOf(availableNodes(session.state(), PLAYER), 9)
      const firstMark = order.findIndex((node) => node.kind === 'mark')
      expect(firstMark).toBeGreaterThan(0)
      expect(order.slice(firstMark).every((node) => node.kind === 'mark')).toBe(true)
    })
  })

  it('buys nothing from the tree while no lane has registered a node', () => {
    withNoLanes(() => {
      const session = botAtUpgradeBay(6, '1e12')
      expect(registeredTechTree().authored).toEqual([])
      buyUpgrades(session, situationOf(session))
      const types = session.commands().map((command) => command.type)
      expect(types).not.toContain('tech-tree.unlock_node')
    })
  })
})
