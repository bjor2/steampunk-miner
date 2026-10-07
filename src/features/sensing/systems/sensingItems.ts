/**
 * What the sensing catalogue rows become (spec #162 sections 1 and 4, #161 section 1): the
 * `vehicle-item` rows, the Mark ladders, the tech nodes and the prices (ticket 241); #203
 * registers the shipped ones.
 */
import type { Money } from '../../../systems/money'
import { bandOrePrice, bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { MarkLadder, TechNode } from '../../tech-tree'
import type { SensingItem } from './sensingCatalogue'
import {
  SENSING_ECONOMY,
  type ChargedSensingBalance,
  type ConsumableSensingBalance,
  type PassiveSensingBalance,
} from './sensingEconomy'

export function vehicleItemOf(item: SensingItem): VehicleItem {
  return { id: item.itemId, iconId: item.iconId, slots: item.slots, attach: item.attach }
}

/** The charged item's `items.charged.<id>` row; every charged item here has one. */
export function chargedBalanceOf(item: SensingItem): ChargedSensingBalance {
  return rowOf(SENSING_ECONOMY.charged, item.itemId, 'items.charged')
}

/** The consumable's `items.consumable.<id>` row; every consumable here has one. */
export function consumableBalanceOf(item: SensingItem): ConsumableSensingBalance {
  return rowOf(SENSING_ECONOMY.consumable, item.itemId, 'items.consumable')
}

/** The passive's `items.passive.<id>` row; every passive here has one. */
export function passiveBalanceOf(item: SensingItem): PassiveSensingBalance {
  return rowOf(SENSING_ECONOMY.passive, item.itemId, 'items.passive')
}

/**
 * The Mark 1 ladder (#162 4.6, the #165 rotation): a charged item steps cooldown, then reveal
 * time, then charges; a consumable steps its ring radius, then its stack; a passive steps its
 * radius or lookahead only (4.4).
 */
export function markLadderOf(item: SensingItem): MarkLadder {
  if (item.powerUpClass === 'charged') return chargedLadderOf(chargedBalanceOf(item))
  if (item.powerUpClass === 'consumable') return consumableLadderOf(consumableBalanceOf(item))
  return passiveLadderOf(passiveBalanceOf(item))
}

export function techNodeOf(item: SensingItem): TechNode {
  const { requiresDiscovery } = item.node
  return {
    id: item.node.id,
    iconId: item.node.iconId,
    lane: 'sensing',
    name: item.name,
    unlockTier: item.node.unlockTier,
    prereqs: item.node.prereqs,
    ...(requiresDiscovery !== null && { requiresDiscovery }),
    unlocks: item.itemId,
    description: item.description,
    label: item.label,
    costKind: 'capability',
    marks: markLadderOf(item),
  }
}

/**
 * The price a card shows on `planetIndex` (#162 4.1): a consumable's unit price is a running cost,
 * read on the planet it is restocked on; every other item pays its one-off price.
 */
export function itemPriceOf(item: SensingItem, planetIndex: number): Money {
  return item.powerUpClass === 'consumable' ? unitPriceOn(planetIndex) : oneOffPriceOf(item)
}

/** `k` band-5 ore priced on the planet the crate is bought on. */
function unitPriceOn(planetIndex: number): Money {
  return bandOrePrice(SENSING_ECONOMY.unitPrice, planetIndex)
}

/** `k` band-5 ore priced at the unlock planet, with its `paceScale`: one fixed number. */
function oneOffPriceOf(item: SensingItem): Money {
  const unlockPlanet = item.node.unlockTier
  return bandOrePriceAt(SENSING_ECONOMY.price, unlockPlanet, unlockPlanet)
}

function chargedLadderOf(balance: ChargedSensingBalance): MarkLadder {
  return {
    isIncomeItem: false,
    cooldown: balance.cooldownTicks,
    magnitude: { base: balance.revealTicks },
    charges: balance.charges,
  }
}

function consumableLadderOf(balance: ConsumableSensingBalance): MarkLadder {
  return { isIncomeItem: false, magnitude: { base: balance.radiusTiles }, charges: balance.stack }
}

function passiveLadderOf(balance: PassiveSensingBalance): MarkLadder {
  return { isIncomeItem: false, magnitude: { base: balance.magnitude } }
}

function rowOf<Row>(rows: Readonly<Record<string, Row>>, itemId: string, path: string): Row {
  const row = rows[itemId]
  if (row === undefined) throw new RangeError(`no ${path} row for ${itemId}`)
  return row
}
