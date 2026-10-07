/**
 * Every buyable the game has, as item refs (K7 #199; the TD's coverage list on #164): the six
 * tracks, casing, guns, the charge rack and restock, lining types, refinery slots, the platform
 * bays, the services and the artefacts, plus the refs every item description entry generates up
 * to a planet. The descriptions slice's coverage walks this one list, so a buyable with no
 * description fails there instead of being missed in one of five files.
 *
 * Each kernel player command says what it buys, so a new kernel command fails the typecheck (and
 * `buyableRefs.test.ts`) until it is placed here.
 */
import { ARTEFACT_OPTIONS } from '../artefacts/artefactOptions'
import type { KernelCommandType } from '../authority/authorityCommand'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { liningTypes, STANDARD_LINING_TYPE } from '../economy/heatEconomy'
import { liningRowIdOf } from '../vehicle/liningType'
import { BAY_IDS } from '../world/dockBays'
import type { ItemKind, ItemRef } from './itemDescriber'
import { generatedItemRefsOn } from './itemDescriptionEntries'

export type KernelPlayerCommandType = Exclude<KernelCommandType, `debug.${string}`>

/** A command that moves, sells, toggles or collects: nothing bought, so no card. */
export const NOT_A_BUY = 'not-a-buy'

const FIRST_PLANET = 1

/** What each kernel player command buys; picked artefacts use the same card (#159). */
export function kernelCommandBuys(): {
  readonly [K in KernelPlayerCommandType]: readonly ItemRef[] | typeof NOT_A_BUY
} {
  return {
    reportPose: NOT_A_BUY,
    drillTile: NOT_A_BUY,
    requestRescue: NOT_A_BUY,
    dock: NOT_A_BUY,
    undock: NOT_A_BUY,
    sellCargo: NOT_A_BUY,
    repairHull: [refOf('service', 'repair')],
    rechargeEnergy: [refOf('service', 'recharge')],
    quickService: [refOf('service', 'quick_service')],
    buyUpgrade: UPGRADE_IDS.map((upgradeId) => refOf('track', upgradeId)),
    buyCasingGrade: [refOf('module', 'casing')],
    buyGun: [refOf('module', 'guns')],
    setGunMode: NOT_A_BUY,
    buyLiningType: buyableLiningTypes().map((type) => refOf('module', liningRowIdOf(type))),
    selectLiningType: NOT_A_BUY,
    queueRefine: [refOf('service', 'refine')],
    buyRefinerySlot: [refOf('module', 'refinery_slot')],
    collectRefined: NOT_A_BUY,
    travel: [refOf('service', 'travel')],
    openArtefactCache: NOT_A_BUY,
    chooseArtefact: ARTEFACT_OPTIONS.map((option) => refOf('artefact', option.id)),
    plantCharge: NOT_A_BUY,
    restockCharges: [refOf('module', 'charges')],
    buyChargeRackSlot: [refOf('module', 'charge_rack')],
    equipItem: NOT_A_BUY,
  }
}

/**
 * The kernel's buyables and every entry's generated refs on planets 1 to `maxPlanet`, each once,
 * sorted by kind, id and grade in code-unit order.
 */
export function listBuyableRefs(maxPlanet: number = FIRST_PLANET): readonly ItemRef[] {
  const refs = [...kernelBuyableRefs(), ...generatedRefsUpTo(maxPlanet)]
  return uniqueRefsOf(refs).sort(compareRefs)
}

function kernelBuyableRefs(): readonly ItemRef[] {
  const bought = Object.values(kernelCommandBuys()).flatMap((buys) =>
    buys === NOT_A_BUY ? [] : buys,
  )
  return [...bought, ...BAY_IDS.map((bay) => refOf('bay', bay))]
}

function generatedRefsUpTo(maxPlanet: number): readonly ItemRef[] {
  const planets = Array.from({ length: maxPlanet }, (_, offset) => FIRST_PLANET + offset)
  return planets.flatMap(generatedItemRefsOn)
}

/** The standard lining comes with the casing; every other type is unlocked for a price (#113). */
function buyableLiningTypes(): readonly string[] {
  return liningTypes().filter((type) => type !== STANDARD_LINING_TYPE)
}

function refOf(kind: ItemKind, id: string): ItemRef {
  return { kind, id }
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
