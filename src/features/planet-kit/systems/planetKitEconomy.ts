/**
 * The kits' numbers (ticket 820, the Systems rows of the GD lock): `planet-kit.economy.json`,
 * read once and refused whole when broken. A tool's price is its `runValueShare` of R(g_home),
 * pace-scaled, the same at every merchant; a consumable's is its own share of R at the buyer's g,
 * not pace-scaled, with one carry limit for all. The premium lift is in basis points and may never
 * pass +25% (VS row 4). `awayMarkup` is recorded as Systems' fallback and applied by nothing.
 * `containers` holds the placed containers' caps per kind, per player and per planet, and the
 * access a new one is placed with (the TD's final ruling on #823, points 1 and 5). `heldFromSale`
 * lists the kit items no merchant sells yet (the GD's ship rule on #850: a hazard tool is held
 * until its verb lands; empty since ticket 882 landed them). `acting` holds what the hazard tools do while they act (ticket 881,
 * `kitActing.ts`).
 */
import { fromCanonical, isNonNegativeMoneyText, type Money } from '../../../systems/money'
import { kitActingOf, kitActingProblems, type KitActing } from './kitActing'
import { CONTAINER_ACCESS, type ContainerAccess } from './placedContainers'
import { isPlainMap, isWholeFrom, SNAKE_ID, type Raw } from './planetKitRowShape'

/** Where a price is read: the item's home planet's g, or the g of the planet it is bought on. */
export type PricedAt = 'home' | 'buyer'

/** How one kind of item is priced: `share · R(g) · (paceScale(g) when paceScaled)`, g per `pricedAt`. */
export interface KitPriceRule {
  runValueShare: Money
  paceScaled: boolean
  pricedAt: PricedAt
}

export interface PlanetKitEconomy {
  /** The trader premium on the planet's own ores, in basis points; at most `PREMIUM_LIFT_CAP_BP`. */
  premiumLiftBp: number
  /** Systems' fallback for a tool sold away from home; recorded, never applied (GD final lock). */
  awayMarkup: Money
  tools: KitPriceRule
  /** Every consumable's carry limit. */
  consumableCarryLimit: number
  /** Each consumable's price rule, by item id. */
  consumablePrices: ReadonlyMap<string, KitPriceRule>
  /** How many containers of each kind one player may have placed on one planet. */
  containerCaps: ReadonlyMap<string, number>
  /** The access a container is placed with. */
  containerDefaultAccess: ContainerAccess
  /** The kit item ids no merchant sells yet, though stocked. */
  heldFromSale: ReadonlySet<string>
  /** The hazard tools' factors, trade-offs and tail, and the flask's window, while they act. */
  acting: KitActing
}

/** VS row 4: the ore premium is at most +25%. */
export const PREMIUM_LIFT_CAP_BP = 2500
const PRICED_AT: readonly PricedAt[] = ['home', 'buyer']
const FIELDS: readonly string[] = [
  'source',
  'premium',
  'awayMarkup',
  'tools',
  'consumables',
  'containers',
  'heldFromSale',
  'acting',
]
const CONSUMABLE_FIELDS: readonly string[] = [
  'carryLimit',
  'paceScaled',
  'pricedAt',
  'runValueShare',
]

/** Why the file is not the kits' numbers; empty when it is. */
export function planetKitEconomyProblems(economy: unknown): string[] {
  if (!isPlainMap(economy)) return ['planet-kit.economy.json must be an object']
  return [
    ...premiumProblems(economy.premium),
    ...(isNonNegativeMoneyText(economy.awayMarkup) ? [] : ['awayMarkup must be money text']),
    ...toolsProblems(economy.tools),
    ...consumablesProblems(economy.consumables),
    ...containersProblems(economy.containers),
    ...heldFromSaleProblems(economy.heldFromSale),
    ...kitActingProblems(economy.acting),
    ...unknownFields(economy, '', FIELDS),
  ]
}

/** The file typed; call only on a file `planetKitEconomyProblems` accepts. */
export function planetKitEconomyOf(economy: Raw): PlanetKitEconomy {
  const premium = economy.premium as Raw
  const tools = economy.tools as Raw
  const consumables = economy.consumables as Raw
  const containers = economy.containers as Raw
  return {
    premiumLiftBp: premium.liftBp as number,
    awayMarkup: fromCanonical(economy.awayMarkup as string),
    tools: priceRuleOf(tools.runValueShare as string, tools.paceScaled as boolean, tools.pricedAt),
    consumableCarryLimit: consumables.carryLimit as number,
    consumablePrices: consumablePricesOf(consumables),
    containerCaps: new Map(Object.entries(containers.capPerPlayerPerPlanet as Raw)) as ReadonlyMap<
      string,
      number
    >,
    containerDefaultAccess: containers.defaultAccess as ContainerAccess,
    heldFromSale: new Set(economy.heldFromSale as string[]),
    acting: kitActingOf(economy.acting as Raw),
  }
}

function consumablePricesOf(consumables: Raw): ReadonlyMap<string, KitPriceRule> {
  const shares = consumables.runValueShare as Record<string, string>
  return new Map(
    Object.entries(shares).map(([id, share]) => [
      id,
      priceRuleOf(share, consumables.paceScaled as boolean, consumables.pricedAt),
    ]),
  )
}

function priceRuleOf(share: string, paceScaled: boolean, pricedAt: unknown): KitPriceRule {
  return { runValueShare: fromCanonical(share), paceScaled, pricedAt: pricedAt as PricedAt }
}

function premiumProblems(premium: unknown): string[] {
  if (!isPlainMap(premium)) return ['premium must be { liftBp }']
  const inRange = isWholeFrom(premium.liftBp, 1) && premium.liftBp <= PREMIUM_LIFT_CAP_BP
  return [
    ...(inRange ? [] : [`premium.liftBp must be a whole number in 1..${PREMIUM_LIFT_CAP_BP}`]),
    ...unknownFields(premium, 'premium', ['liftBp']),
  ]
}

function toolsProblems(tools: unknown): string[] {
  if (!isPlainMap(tools)) return ['tools must be { runValueShare, paceScaled, pricedAt }']
  return [
    ...priceRuleProblems(tools, 'tools'),
    ...unknownFields(tools, 'tools', ['runValueShare', 'paceScaled', 'pricedAt']),
  ]
}

function consumablesProblems(consumables: unknown): string[] {
  if (!isPlainMap(consumables)) return ['consumables must be an object']
  return [
    ...(isWholeFrom(consumables.carryLimit, 1)
      ? []
      : ['consumables.carryLimit must be a whole number from 1']),
    ...(typeof consumables.paceScaled === 'boolean'
      ? []
      : ['consumables.paceScaled must be boolean']),
    ...pricedAtProblems(consumables.pricedAt, 'consumables'),
    ...sharesProblems(consumables.runValueShare),
    ...unknownFields(consumables, 'consumables', CONSUMABLE_FIELDS),
  ]
}

function sharesProblems(shares: unknown): string[] {
  if (!isPlainMap(shares)) return ['consumables.runValueShare must map item ids to money text']
  return Object.entries(shares).flatMap(([id, share]) => [
    ...(SNAKE_ID.test(id) ? [] : [`consumables.runValueShare.${id} is not a snake_case item id`]),
    ...(isNonNegativeMoneyText(share)
      ? []
      : [`consumables.runValueShare.${id} must be money text`]),
  ])
}

function containersProblems(containers: unknown): string[] {
  if (!isPlainMap(containers))
    return ['containers must be { capPerPlayerPerPlanet, defaultAccess }']
  return [
    ...containerCapsProblems(containers.capPerPlayerPerPlanet),
    ...(CONTAINER_ACCESS.includes(containers.defaultAccess as ContainerAccess)
      ? []
      : [`containers.defaultAccess must be one of ${CONTAINER_ACCESS.join(', ')}`]),
    ...unknownFields(containers, 'containers', ['capPerPlayerPerPlanet', 'defaultAccess']),
  ]
}

function containerCapsProblems(caps: unknown): string[] {
  if (!isPlainMap(caps)) return ['containers.capPerPlayerPerPlanet must map kinds to whole numbers']
  return Object.entries(caps).flatMap(([kind, cap]) => [
    ...(SNAKE_ID.test(kind)
      ? []
      : [`containers.capPerPlayerPerPlanet.${kind} is not a snake_case kind`]),
    ...(isWholeFrom(cap, 1)
      ? []
      : [`containers.capPerPlayerPerPlanet.${kind} must be a whole number from 1`]),
  ])
}

function heldFromSaleProblems(held: unknown): string[] {
  if (!Array.isArray(held)) return ['heldFromSale must list item ids']
  return held.flatMap((id, at) => [
    ...(typeof id === 'string' && SNAKE_ID.test(id)
      ? []
      : [`heldFromSale[${at}] is not a snake_case item id`]),
    ...(held.indexOf(id) === at ? [] : [`heldFromSale[${at}] lists ${String(id)} again`]),
  ])
}

function priceRuleProblems(rule: Raw, where: string): string[] {
  return [
    ...(isNonNegativeMoneyText(rule.runValueShare)
      ? []
      : [`${where}.runValueShare must be money text`]),
    ...(typeof rule.paceScaled === 'boolean' ? [] : [`${where}.paceScaled must be boolean`]),
    ...pricedAtProblems(rule.pricedAt, where),
  ]
}

function pricedAtProblems(value: unknown, where: string): string[] {
  return PRICED_AT.includes(value as PricedAt) ? [] : [`${where}.pricedAt must be home or buyer`]
}

function unknownFields(map: Raw, where: string, fields: readonly string[]): string[] {
  const prefix = where === '' ? '' : `${where}.`
  return Object.keys(map)
    .filter((field) => !fields.includes(field))
    .map((field) => `${prefix}${field} is not a field of the kits' economy`)
}
