import { describe, expect, it } from 'vitest'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { BotSession } from '../../../systems/bot/botSession'
import { buySlicePurchases } from '../../../systems/bot/botSlicePurchases'
import { cmp, ZERO_MONEY } from '../../../systems/money'
import { FIXTURE_ITEM_PRICE, TREE_SHOP_FIXTURE_SLICE } from '../treeFixtureSlice'
import { PLAYER, sessionOnPlanet, withFixtureTree } from '../treeTestSession'
import { laneSpendRowsOf } from './laneSpend'
import { registeredTechTree, treeNodeOf } from './techTree'
import { unlockedNodeIdsOf } from './techTreeSection'

// The tree's side of the store (ticket 248): the bot buys what it researched and researches only
// nodes whose item some slice sells (the Vertical Scaler's filter on the #157 gap review).

function botAtUpgradeBay(planetIndex: number, wallet: string): BotSession {
  const session = sessionOnPlanet(planetIndex, wallet)
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

const withShop = <T>(run: () => T) => withFixtureTree(run, [TREE_SHOP_FIXTURE_SLICE])

/** The slices' purchases alone: the kernel's track buys add nothing here and take long. */
function shopOn(planetIndex: number) {
  const session = botAtUpgradeBay(planetIndex, '1e12')
  const spends = buySlicePurchases(session)
  return { session, spends }
}

const commandTypesOf = (session: BotSession) => session.commands().map((command) => command.type)

describe('tech tree: the bot buys what it researched (ticket 248)', () => {
  it('buys the item of every capability it researched, logging each purchase', () => {
    withShop(() => {
      const { session } = shopOn(6)
      const researched = unlockedNodeIdsOf(session.state(), PLAYER)
      const items = researched.map((nodeId) => treeNodeOf(registeredTechTree(), nodeId)!.unlocks)
      expect(researched.length).toBeGreaterThan(0)
      items.forEach(({ itemId }) => expect(ownsItem(session.state(), PLAYER, itemId)).toBe(true))
      const bought = session.events().filter((event) => event.type === 'VehicleItemPurchased')
      expect(bought).toHaveLength(items.length)
    })
  })

  it('buys an item it researched before it researches the next node', () => {
    withShop(() => {
      const types = commandTypesOf(shopOn(6).session)
      const firstResearch = types.indexOf('tech-tree.unlock_node')
      const nextResearch = types.indexOf('tech-tree.unlock_node', firstResearch + 1)
      expect(types.indexOf('buyVehicleItem', firstResearch)).toBeLessThan(nextResearch)
    })
  })

  it('researches nothing while no slice sells what the nodes unlock', () => {
    withFixtureTree(() => {
      expect(commandTypesOf(shopOn(6).session)).not.toContain('tech-tree.unlock_node')
    })
  })

  it('skips a node whose item is a consumable it could not buy whole', () => {
    withShop(() => {
      const researched = unlockedNodeIdsOf(shopOn(6).session.state(), PLAYER)
      expect(researched).not.toContain('tech.terrain.stabiliser_foam')
      expect(researched).toContain('tech.sensing.echo_sounder')
    })
  })

  it('skips a Mark of an item it already owns: the Mark buys nothing', () => {
    withShop(() => {
      const researched = unlockedNodeIdsOf(shopOn(6).session.state(), PLAYER)
      expect(
        researched.filter((nodeId) => treeNodeOf(registeredTechTree(), nodeId)!.kind === 'mark'),
      ).toEqual([])
    })
  })
})

describe('tech tree: spend by lane for the #212 guard (ticket 248)', () => {
  it('splits the tree spend into node and item spend per planet and lane', () => {
    withShop(() => {
      const rows = laneSpendRowsOf(shopOn(6).spends)
      const sensing = rows.find((row) => row.lane === 'sensing')!
      expect(sensing.planetIndex).toBe(6)
      expect(cmp(sensing.nodeSpend, ZERO_MONEY)).toBe(1)
      expect(cmp(sensing.itemSpend, FIXTURE_ITEM_PRICE)).toBeGreaterThanOrEqual(0)
    })
  })

  it('reads no row from purchases that are not the tree’s', () => {
    withShop(() => {
      const spend = {
        planetIndex: 6,
        source: 'kernel' as const,
        purchaseId: 'buyUpgrade',
        cost: FIXTURE_ITEM_PRICE,
      }
      expect(laneSpendRowsOf([spend])).toEqual([])
    })
  })
})
