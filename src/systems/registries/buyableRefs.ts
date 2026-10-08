/**
 * Every buyable the game has, as item refs (K7 #199; the TD's coverage list on #164): the six
 * tracks, casing, guns, the charge rack and restock, lining types, refinery slots, the platform
 * bays, the services and the artefacts, plus the refs every item description entry generates up
 * to a planet. The descriptions slice's coverage walks this one list, so a buyable with no
 * description fails there instead of being missed in one of five files.
 *
 * Each kernel player command says what it buys, so a new kernel command fails the typecheck (and
 * `buyableRefs.test.ts`) until it is placed here. `buyVehicleItem` buys every registered vehicle
 * item a slice sells on one of the planets walked (ticket 248).
 */
import type { KernelCommandType } from '../authority/authorityCommand'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { liningTypes, STANDARD_LINING_TYPE } from '../economy/heatEconomy'
import { BAY_IDS } from '../world/dockBays'
import { contentOf } from './content'
import { everyArtefactOption } from './artefactOptions'
import type { ItemRef } from './itemDescriber'
import { generatedItemRefsOn } from './itemDescriptionEntries'
import {
  artefactItemOf,
  bayItemOf,
  KERNEL_ITEMS,
  liningItemOf,
  trackItemOf,
  vehicleItemRefOf,
} from './kernelItems'
import { vehicleItemOfferOf } from './vehicleItemSales'

export type KernelPlayerCommandType = Exclude<KernelCommandType, `debug.${string}`>

/** A command that moves, sells, toggles or collects: nothing bought, so no card. */
export const NOT_A_BUY = 'not-a-buy'

const FIRST_PLANET = 1

/**
 * What each kernel player command buys on planets 1 to `maxPlanet`; picked artefacts use the same
 * card (#159).
 */
export function kernelCommandBuys(maxPlanet: number = FIRST_PLANET): {
  readonly [K in KernelPlayerCommandType]: readonly ItemRef[] | typeof NOT_A_BUY
} {
  return {
    reportPose: NOT_A_BUY,
    drillTile: NOT_A_BUY,
    requestRescue: NOT_A_BUY,
    dock: NOT_A_BUY,
    undock: NOT_A_BUY,
    sellCargo: NOT_A_BUY,
    repairHull: [KERNEL_ITEMS.repair],
    rechargeEnergy: [KERNEL_ITEMS.recharge],
    quickService: [KERNEL_ITEMS.quickService],
    buyUpgrade: UPGRADE_IDS.map(trackItemOf),
    buyCasingGrade: [KERNEL_ITEMS.casing],
    buyGun: [KERNEL_ITEMS.guns],
    setGunMode: NOT_A_BUY,
    buyLiningType: buyableLiningTypes().map(liningItemOf),
    selectLiningType: NOT_A_BUY,
    queueRefine: [KERNEL_ITEMS.refine],
    buyRefinerySlot: [KERNEL_ITEMS.refinerySlot],
    collectRefined: NOT_A_BUY,
    travel: [KERNEL_ITEMS.travel],
    openArtefactCache: NOT_A_BUY,
    chooseArtefact: everyArtefactOption().map((option) => artefactItemOf(option.id)),
    plantCharge: NOT_A_BUY,
    restockCharges: [KERNEL_ITEMS.charges],
    buyChargeRackSlot: [KERNEL_ITEMS.chargeRack],
    equipItem: NOT_A_BUY,
    buyVehicleItem: soldVehicleItemRefsUpTo(maxPlanet),
    'ground_gun.fire': NOT_A_BUY,
    'ground_gun.set_auto': NOT_A_BUY,
  }
}

/**
 * The kernel's buyables and every entry's generated refs on planets 1 to `maxPlanet`, each once,
 * sorted by kind, id and grade in code-unit order.
 */
export function listBuyableRefs(maxPlanet: number = FIRST_PLANET): readonly ItemRef[] {
  const refs = [...kernelBuyableRefs(maxPlanet), ...generatedRefsUpTo(maxPlanet)]
  return uniqueRefsOf(refs).sort(compareRefs)
}

function kernelBuyableRefs(maxPlanet: number): readonly ItemRef[] {
  const bought = Object.values(kernelCommandBuys(maxPlanet)).flatMap((buys) =>
    buys === NOT_A_BUY ? [] : buys,
  )
  return [...bought, ...BAY_IDS.map(bayItemOf)]
}

function generatedRefsUpTo(maxPlanet: number): readonly ItemRef[] {
  return planetsUpTo(maxPlanet).flatMap(generatedItemRefsOn)
}

/** Each registered vehicle item some slice sells on a planet up to `maxPlanet`. */
function soldVehicleItemRefsUpTo(maxPlanet: number): readonly ItemRef[] {
  const planets = planetsUpTo(maxPlanet)
  return contentOf('vehicle-item')
    .filter((item) => isSoldOnAnyOf(item.id, planets))
    .map((item) => vehicleItemRefOf(item.id))
}

function isSoldOnAnyOf(itemId: string, planets: readonly number[]): boolean {
  return planets.some((planet) => vehicleItemOfferOf(itemId, planet) !== null)
}

function planetsUpTo(maxPlanet: number): number[] {
  return Array.from({ length: maxPlanet }, (_, offset) => FIRST_PLANET + offset)
}

/** The standard lining comes with the casing; every other type is unlocked for a price (#113). */
function buyableLiningTypes(): readonly string[] {
  return liningTypes().filter((type) => type !== STANDARD_LINING_TYPE)
}

function uniqueRefsOf(refs: readonly ItemRef[]): ItemRef[] {
  const byKey = new Map(refs.map((ref) => [refKeyOf(ref), ref]))
  return [...byKey.values()]
}

function refKeyOf(ref: ItemRef): string {
  return `${ref.kind}|${ref.id}|${ref.grade ?? ''}`
}

function compareRefs(a: ItemRef, b: ItemRef): number {
  return compareText(a.kind, b.kind) || compareText(a.id, b.id) || (a.grade ?? -1) - (b.grade ?? -1)
}

/** Code-unit order, never locale order, so every machine lists the same way. */
function compareText(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
