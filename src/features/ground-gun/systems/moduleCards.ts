/**
 * The shipped `bore_gun` modules' cards (#159 through the K7 `itemDescriptionEntries` seam, ticket
 * 318): Content's flavour line and the module's stats at the Mark the card's level names, read
 * from the same rules the gun acts on (`boreGunModules.ts`, `boreLadders.ts`), with the one-off
 * price last. A card at level 0 reads Mark 1, the module as bought; a Mark-stepped line shows the
 * next Mark until the module is Mastered.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt } from '../../tech-tree'
import { searWaitTicksAt, sightRetargetTicksAt } from './boreGunModules'
import {
  boreGunModuleOf,
  GIMBAL_SIGHT_ITEM_ID,
  LONG_BARREL_ITEM_ID,
  markLadderOf,
  modulePriceOf,
  SHIPPED_BORE_GUN_MODULES,
  type BoreGunModule,
} from './boreGunLane'
import { longBarrelAt } from './boreLadders'
import { GROUND_GUN } from './groundGunEconomy'

const BOUGHT_MARK = 1

/** One stat a module's card prints at a Mark. */
interface ModuleStatLine {
  label: string
  valueAt(mark: number): Money
}

const MODULE_STAT_LINES: Readonly<Record<string, readonly ModuleStatLine[]>> = {
  [GIMBAL_SIGHT_ITEM_ID]: [
    { label: 'Looks again every (s)', valueAt: (mark) => secondsOf(sightRetargetTicksAt(mark)) },
  ],
  [STEAM_SEAR_ITEM_ID]: [
    { label: 'Waits after a manual shot (s)', valueAt: (mark) => secondsOf(searWaitTicksAt(mark)) },
  ],
  [LONG_BARREL_ITEM_ID]: [
    {
      label: 'Bore reach (cells)',
      valueAt: (mark) => fromSafeInteger(longBarrelAt(mark).rangeCells),
    },
    {
      label: 'Hold before the collapse check (s)',
      valueAt: (mark) =>
        secondsOf(GROUND_GUN.bore.collapseHoldTicks + longBarrelAt(mark).holdTicks),
    },
  ],
}

export function boreGunModuleCards(): ItemDescriptionEntry[] {
  return SHIPPED_BORE_GUN_MODULES.map(cardOf)
}

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function moduleMarkOfLevel(level: number): number {
  return Math.max(BOUGHT_MARK, level)
}

function cardOf(module: BoreGunModule): ItemDescriptionEntry {
  return {
    id: `ground-gun.${module.itemId.slice('weapon.'.length)}`,
    matches: { kind: 'vehicle-item', id: module.itemId },
    flavour: module.description,
    statLines: [...(MODULE_STAT_LINES[module.itemId] ?? []).map(markLineOf), priceLineOf(module)],
  }
}

function markLineOf(line: ModuleStatLine): DescribedStatLineSpec {
  return {
    label: line.label,
    kind: 'linearInt',
    value: (_ref, ctx) => line.valueAt(moduleMarkOfLevel(ctx.level)),
    nextLevel: nextMarkOf,
  }
}

function priceLineOf(module: BoreGunModule): DescribedStatLineSpec {
  return {
    label: 'Price',
    kind: 'geometric',
    value: () => modulePriceOf(module),
    nextLevel: hasNoNextLevel,
  }
}

function nextMarkOf(ref: ItemRef, ctx: ItemCtx): number | null {
  const mark = moduleMarkOfLevel(ctx.level)
  if (boreGunModuleOf(ref.id) === null || isMasteredAt(markLadderOf(ref.id), mark)) return null
  return mark + 1
}

function secondsOf(ticks: number): Money {
  return div(fromSafeInteger(ticks), fromSafeInteger(TICKS_PER_SECOND))
}
