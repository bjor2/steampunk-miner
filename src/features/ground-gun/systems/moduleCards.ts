/**
 * The shipped `bore_gun` modules' cards (#159 through the K7 `itemDescriptionEntries` seam, ticket
 * 318): Content's flavour line and the module's stats at the Mark the card's level names, read
 * from the same rules the gun acts on (`boreGunModules.ts`, `boreLadders.ts`), with the one-off
 * price last. A card at level 0 reads Mark 1, the module as bought; a Mark-stepped line shows the
 * next Mark until the module is Mastered. The signature modules (ticket 380) print the stats their
 * shape and charges read (`signatureShapes.ts`, `moduleUse.ts`).
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import { WHOLE_BP } from '../../../systems/registries/boreGun'
import type { ItemCtx } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt, type MarkLadder } from '../../tech-tree'
import { moduleStatsAt } from './armouryModules'
import { searWaitTicksAt, sightRetargetTicksAt } from './boreGunModules'
import {
  CEMENTING_ROUND_ITEM_ID,
  EARTHING_SPIKE_ITEM_ID,
  GIMBAL_SIGHT_ITEM_ID,
  LONG_BARREL_ITEM_ID,
  RIFLED_BORE_ITEM_ID,
  SPLAY_CHOKE_ITEM_ID,
  STRUT_BORE_ITEM_ID,
  markLadderOf,
  modulePriceOf,
  SHIPPED_BORE_GUN_MODULES,
} from './boreGunLane'
import { longBarrelAt } from './boreLadders'
import { GROUND_GUN } from './groundGunEconomy'

const BOUGHT_MARK = 1

/** One stat a module's card prints at a Mark. */
export interface ModuleStatLine {
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
  [SPLAY_CHOKE_ITEM_ID]: [
    countLineOf('Lines a shot', SPLAY_CHOKE_ITEM_ID, 'splayLines'),
    secondsLineOf('Added to the wait between shots (s)', SPLAY_CHOKE_ITEM_ID, 'splayCooldownTicks'),
  ],
  [CEMENTING_ROUND_ITEM_ID]: [
    countLineOf('Rounds a dock', CEMENTING_ROUND_ITEM_ID, 'cementCharges'),
    secondsLineOf('Waits between rounds (s)', CEMENTING_ROUND_ITEM_ID, 'cementCooldownTicks'),
    {
      label: "Extra energy a cell (the drill's)",
      valueAt: (mark) =>
        drillSharesOf(statAt(CEMENTING_ROUND_ITEM_ID, mark, 'cementEnergyPerCellBp')),
    },
  ],
  [EARTHING_SPIKE_ITEM_ID]: [
    secondsLineOf('Grounds the line for (s)', EARTHING_SPIKE_ITEM_ID, 'groundTicks'),
    secondsLineOf('Waits between spikes (s)', EARTHING_SPIKE_ITEM_ID, 'groundCooldownTicks'),
  ],
  [RIFLED_BORE_ITEM_ID]: [
    countLineOf('Seam turns a line', RIFLED_BORE_ITEM_ID, 'rifleTurns'),
    secondsLineOf('Added to the wait between shots (s)', RIFLED_BORE_ITEM_ID, 'rifleCooldownTicks'),
  ],
  [STRUT_BORE_ITEM_ID]: [
    secondsLineOf('A strut stands for (s)', STRUT_BORE_ITEM_ID, 'strutTicks'),
    countLineOf('Struts a dock', STRUT_BORE_ITEM_ID, 'strutCharges'),
  ],
}

/** What a card reads of an armoury module of either lane. */
export interface CardedModule {
  itemId: string
  description: string
  node: { unlockTier: number }
}

export function boreGunModuleCards(): ItemDescriptionEntry[] {
  return SHIPPED_BORE_GUN_MODULES.map((module) =>
    moduleCardOf(module, MODULE_STAT_LINES[module.itemId] ?? [], markLadderOf),
  )
}

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function moduleMarkOfLevel(level: number): number {
  return Math.max(BOUGHT_MARK, level)
}

/** The module's card: its flavour, each stat at the card's Mark, then its one-off price. */
export function moduleCardOf(
  module: CardedModule,
  lines: readonly ModuleStatLine[],
  ladderOf: (itemId: string) => MarkLadder,
): ItemDescriptionEntry {
  return {
    id: `ground-gun.${module.itemId.slice('weapon.'.length)}`,
    matches: { kind: 'vehicle-item', id: module.itemId },
    flavour: module.description,
    statLines: [...lines.map((line) => markLineOf(line, ladderOf)), priceLineOf(module)],
  }
}

function markLineOf(
  line: ModuleStatLine,
  ladderOf: (itemId: string) => MarkLadder,
): DescribedStatLineSpec {
  return {
    label: line.label,
    kind: 'linearInt',
    value: (_ref, ctx) => line.valueAt(moduleMarkOfLevel(ctx.level)),
    nextLevel: (ref, ctx) => nextMarkOf(ladderOf(ref.id), ctx),
  }
}

function priceLineOf(module: CardedModule): DescribedStatLineSpec {
  return {
    label: 'Price',
    kind: 'geometric',
    value: () => modulePriceOf(module),
    nextLevel: hasNoNextLevel,
  }
}

function nextMarkOf(ladder: MarkLadder, ctx: ItemCtx): number | null {
  const mark = moduleMarkOfLevel(ctx.level)
  return isMasteredAt(ladder, mark) ? null : mark + 1
}

export function secondsOf(ticks: number): Money {
  return div(fromSafeInteger(ticks), fromSafeInteger(TICKS_PER_SECOND))
}

export function countLineOf(label: string, itemId: string, stat: string): ModuleStatLine {
  return { label, valueAt: (mark) => fromSafeInteger(statAt(itemId, mark, stat)) }
}

export function secondsLineOf(label: string, itemId: string, stat: string): ModuleStatLine {
  return { label, valueAt: (mark) => secondsOf(statAt(itemId, mark, stat)) }
}

export function statAt(itemId: string, mark: number, stat: string): number {
  return moduleStatsAt(itemId, mark).stats[stat]
}

/** Basis points of the drill's dig energy, as a share of it. */
function drillSharesOf(bp: number): Money {
  return div(fromSafeInteger(bp), fromSafeInteger(WHOLE_BP))
}
