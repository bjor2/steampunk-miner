import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import {
  buyVehicleItemCommand,
  setVehicleLoadoutCommand,
} from '../../systems/authority/loadoutCommands'
import { ownsItem } from '../../systems/authority/loadoutRules'
import { createBotSession, type BotSession } from '../../systems/bot/botSession'
import { buySlicePurchases } from '../../systems/bot/botSlicePurchases'
import { formatAmount } from '../../systems/displayAmount'
import { cmp, fromCanonical, sub, toCanonical, type Money } from '../../systems/money'
import { describeItem, type ItemCtx } from '../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../systems/registries/itemSnapshotView'
import { vehicleItemOfferOf } from '../../systems/registries/vehicleItemSales'
import { nodeCostOf, researchedMarkOf, unlockedItems, unlockTierOfItem } from '../tech-tree'
import { COMBO_HOLDS, COMBO_ITEMS, comboPriceAt } from '.'

// The shipped combos in play (GD lock on #206, decisions 7 and 8): grade 1 is a one-off buy of 15
// band-5 ore at the unlock planet, its card shows "Grade N", each parent's own lines at the Mark
// the player plays it at and the price the bay debits; later grades are research-only, each
// dearer than the one before, debiting what the tree card shows.

const PLAYER = 'p1'
const SHIPPED = COMBO_ITEMS.filter((item) => !Object.hasOwn(COMBO_HOLDS, item.itemId))
const ALL_PARENTS = [...new Set(SHIPPED.flatMap((item) => item.parentItemIds))]
const LAST_GRADED_PLANET = 140
/** Small enough that a P28 price comes off it exactly: Money keeps 40 digits (#340). */
const WALLET_EXACT_AT_P28 = '1e30'

function sessionOn(planetIndex: number, money = '1e60'): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  if (planetIndex !== 1) session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: money } })
  return session
}

function grantThrough(session: BotSession, planetIndex: number): void {
  session.submit({ type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } })
}

function walletOf(session: BotSession): Money {
  return session.state().players[PLAYER].wallet
}

function debitOf(session: BotSession, submit: () => readonly DomainEvent[]): Money {
  const before = walletOf(session)
  submit()
  return sub(before, walletOf(session))
}

function cardCtxOf(session: BotSession, level = 0): ItemCtx {
  const state = session.state()
  return {
    playerId: PLAYER,
    planetIndex: state.planet.index,
    level,
    view: itemSnapshotViewOf(state, PLAYER),
  }
}

/**
 * Each combo's generated grades and the planet each is researched on, by item id, up to `through`.
 * The authored grades (P15-P36) are granted first, so none is booked as a planet-41 grade.
 */
function gradePlanetsOf(through: number): Map<string, number[]> {
  const session = sessionOn(41)
  grantThrough(session, 40)
  const planets = new Map<string, number[]>()
  for (let planet = 41; planet <= through; planet += 3) {
    session.submit({ type: 'debug.setPlanet', payload: { planetIndex: planet } })
    const before = gradesOf(session)
    grantThrough(session, planet)
    gradesOf(session).forEach((grade, itemId) => {
      if (grade > (before.get(itemId) ?? 0))
        planets.set(itemId, [...(planets.get(itemId) ?? []), planet])
    })
  }
  return planets
}

function gradesOf(session: BotSession): Map<string, number> {
  const unlocks = unlockedItems(session.state(), PLAYER).filter((u) =>
    u.itemId.startsWith('combo.'),
  )
  return new Map(unlocks.map((unlock) => [unlock.itemId, unlock.mark]))
}

describe('combos in play: grade 1, the one-off buy', () => {
  it('sells each shipped combo at 15 band-5 ore priced on its unlock planet', () => {
    SHIPPED.forEach((item) => {
      const unlockPlanet = unlockTierOfItem(item.itemId)
      const expected = item.node?.unlockTier ?? unlockPlanet
      expect(unlockPlanet, item.itemId).toBe(expected)
      const offer = vehicleItemOfferOf(item.itemId, 1)
      expect(offer?.name).toBe(item.name)
      expect(toCanonical(offer!.price)).toBe(toCanonical(comboPriceAt(unlockPlanet as number)))
    })
  })

  it('first offers the endless-only combos on a generated combo planet past 40', () => {
    const endless = SHIPPED.filter((item) => item.node === null)
    expect(endless.length).toBe(2)
    endless.forEach((item) => {
      const planet = unlockTierOfItem(item.itemId) as number
      expect(planet).toBeGreaterThanOrEqual(41)
      expect((planet - 41) % 3).toBe(0)
    })
  })

  it('debits at the Upgrade bay exactly the price its card shows', () => {
    const session = sessionOn(28, WALLET_EXACT_AT_P28)
    grantThrough(session, 28)
    session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
    const drain = SHIPPED.find((item) => item.itemId === 'combo.cored_drain')!
    const card = describeItem({ kind: 'vehicle-item', id: drain.itemId }, cardCtxOf(session))
    const debit = debitOf(session, () => session.submit(buyVehicleItemCommand(drain.itemId)))
    expect(ownsItem(session.state(), PLAYER, drain.itemId)).toBe(true)
    expect(card?.statLines.find((line) => line.label === 'Price')?.now).toBe(formatAmount(debit))
    expect(toCanonical(debit)).toBe(toCanonical(vehicleItemOfferOf(drain.itemId, 28)!.price))
  })
})

describe('combos in play: later grades', () => {
  const gradePlanets = gradePlanetsOf(LAST_GRADED_PLANET)

  it('grades each shipped combo on from planet 41 and never a held one', () => {
    SHIPPED.forEach((item) => expect(gradePlanets.get(item.itemId)?.length).toBeGreaterThan(1))
    Object.keys(COMBO_HOLDS).forEach((itemId) => expect(gradePlanets.has(itemId)).toBe(false))
  })

  it('prices every grade strictly above the grade before it', () => {
    SHIPPED.forEach((item) => {
      const costs = [
        ...(item.node === null ? [] : [nodeCostOf(item.node.id, item.node.unlockTier)]),
        ...(gradePlanets.get(item.itemId) ?? []).map((p) => nodeCostOf(`tech.combo.gen.${p}`, p)),
      ] as Money[]
      costs.slice(1).forEach((cost, index) => expect(cmp(cost, costs[index])).toBe(1))
    })
  })

  it('debits a grade the price the tree card shows, once both parents are owned', () => {
    const [planet] = gradePlanets.get('combo.assay_drain') ?? []
    const nodeId = `tech.combo.gen.${planet}`
    const session = sessionOn(planet)
    grantThrough(session, planet - 1)
    const refused = session.submit({ type: 'tech-tree.unlock_node', payload: { nodeId } })
    expect(refused.find((event) => event.type === 'tech-tree.TechNodeRefused')).toMatchObject({
      reason: 'not_owned',
    })
    session.submit(setVehicleLoadoutCommand({}, ['combo.assay_drain', ...ALL_PARENTS]))
    const cardCost = nodeCostOf(nodeId, planet) as Money
    session.submit({ type: 'debug.setMoney', payload: { amount: toCanonical(cardCost) } })
    const debit = debitOf(session, () =>
      session.submit({ type: 'tech-tree.unlock_node', payload: { nodeId } }),
    )
    expect(toCanonical(debit)).toBe(toCanonical(cardCost))
    expect(cmp(walletOf(session), fromCanonical('0'))).toBe(0)
    expect(researchedMarkOf(session.state(), PLAYER, 'combo.assay_drain')).toBe(2)
  })
})

describe('combos in play: the card', () => {
  it('shows Grade 1 in the shop, then the grade researched', () => {
    const session = sessionOn(15)
    const ref = { kind: 'vehicle-item' as const, id: 'combo.assay_drain' }
    expect(describeItem(ref, cardCtxOf(session))?.statLines[0]).toMatchObject({
      label: 'Combo',
      now: 'Grade 1',
    })
    expect(describeItem(ref, cardCtxOf(session, 3))?.statLines[0].now).toBe('Grade 3')
  })

  it("shows each parent's own lines, read at the Mark the player researched it to", () => {
    const session = sessionOn(30)
    grantThrough(session, 30)
    const ctx = cardCtxOf(session)
    const combo = describeItem({ kind: 'vehicle-item', id: 'combo.cored_drain' }, ctx)
    const mark = researchedMarkOf(session.state(), PLAYER, 'power.mineral_drain')
    expect(mark).toBeGreaterThan(1)
    const drain = describeItem(
      { kind: 'vehicle-item', id: 'power.mineral_drain' },
      { ...ctx, level: mark },
    )
    const drainLines = drain?.statLines ?? []
    const shown = combo?.statLines.filter((line) => line.label.startsWith('Mineral drain: ')) ?? []
    expect(shown.length).toBeGreaterThan(0)
    shown.forEach((line) => {
      const own = drainLines.find((l) => `Mineral drain: ${l.label}` === line.label)
      expect(own?.now, line.label).toBe(line.now)
    })
  })
})

describe('combos in play: the pacing bot', () => {
  it('researches and buys a combo once it owns both parents and the lab is up', () => {
    const session = sessionOn(15, '1e12')
    grantThrough(session, 14)
    session.submit(setVehicleLoadoutCommand({}, ['passive.assay_lens', 'power.mineral_drain']))
    session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
    buySlicePurchases(session)
    expect(ownsItem(session.state(), PLAYER, 'combo.assay_drain')).toBe(true)
    expect(cmp(walletOf(session), fromCanonical('0'))).toBeGreaterThanOrEqual(0)
  })
})
