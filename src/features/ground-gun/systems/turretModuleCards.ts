/**
 * The `auto_guns` modules' cards (#159 through the K7 `itemDescriptionEntries` seam, ticket 388):
 * Content's flavour line, then every stat the turret really reads at the card's Mark, from the same
 * rules the shape and the flush act on (`turretShapes.ts`, `flushingShell.ts`), and the one-off price
 * last. The grapeshot's and the ricochet's cooldowns print no line: no seam reaches them yet.
 */
import { fromSafeInteger, div, type Money } from '../../../systems/money'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import {
  autoGunsMarkLadderOf,
  CONCUSSION_SHELLS_ITEM_ID,
  EXTENDED_BARRELS_ITEM_ID,
  FIRE_DIRECTOR_ITEM_ID,
  FLUSHING_SHELL_ITEM_ID,
  GRAPESHOT_BREECH_ITEM_ID,
  OVERPRESSURE_BURST_ITEM_ID,
  RICOCHET_SHOT_ITEM_ID,
  SENTRY_CAM_ITEM_ID,
  SHIPPED_AUTO_GUNS_MODULES,
} from './autoGunsLane'
import { extendedBarrelsAt, MILLI_PER_UNIT } from './boreLadders'
import { countLineOf, moduleCardOf, secondsLineOf, type ModuleStatLine } from './moduleCards'

const TURRET_STAT_LINES: Readonly<Record<string, readonly ModuleStatLine[]>> = {
  [FIRE_DIRECTOR_ITEM_ID]: [
    secondsLineOf('Ranks the pack again every (s)', FIRE_DIRECTOR_ITEM_ID, 'directorRetargetTicks'),
  ],
  [SENTRY_CAM_ITEM_ID]: [
    secondsLineOf(
      'Covers the drill face after resting (s)',
      SENTRY_CAM_ITEM_ID,
      'camOpenDelayTicks',
    ),
  ],
  [EXTENDED_BARRELS_ITEM_ID]: [
    {
      label: 'Range (tiles)',
      valueAt: (mark) => fromSafeInteger(extendedBarrelsAt(mark).rangeTiles),
    },
    {
      label: 'Energy a shot',
      valueAt: (mark) => unitsOfMilli(extendedBarrelsAt(mark).energyPerShotMilli),
    },
  ],
  [CONCUSSION_SHELLS_ITEM_ID]: [
    countLineOf('Knock-back (cells)', CONCUSSION_SHELLS_ITEM_ID, 'knockCells'),
    secondsLineOf(
      'Knocks one enemy at most every (s)',
      CONCUSSION_SHELLS_ITEM_ID,
      'knockCooldownTicks',
    ),
  ],
  [GRAPESHOT_BREECH_ITEM_ID]: [
    countLineOf('Enemies a shot is split across', GRAPESHOT_BREECH_ITEM_ID, 'grapeTargets'),
    countLineOf('Spread (degrees)', GRAPESHOT_BREECH_ITEM_ID, 'grapeConeDeg'),
  ],
  [FLUSHING_SHELL_ITEM_ID]: [
    countLineOf('Reaches burrowers within (cells)', FLUSHING_SHELL_ITEM_ID, 'flushRange'),
    secondsLineOf('Burrower surfaces within (s)', FLUSHING_SHELL_ITEM_ID, 'flushTicks'),
    secondsLineOf('Thumps every (s)', FLUSHING_SHELL_ITEM_ID, 'flushCooldownTicks'),
  ],
  [OVERPRESSURE_BURST_ITEM_ID]: [
    secondsLineOf('Burst lasts (s)', OVERPRESSURE_BURST_ITEM_ID, 'burstTicks'),
    secondsLineOf('Vent lasts (s)', OVERPRESSURE_BURST_ITEM_ID, 'ventTicks'),
  ],
  [RICOCHET_SHOT_ITEM_ID]: [
    countLineOf('Bounce reach (cells)', RICOCHET_SHOT_ITEM_ID, 'bounceLegCells'),
  ],
}

export function autoGunsModuleCards(): ItemDescriptionEntry[] {
  return SHIPPED_AUTO_GUNS_MODULES.map((module) =>
    moduleCardOf(module, TURRET_STAT_LINES[module.itemId] ?? [], autoGunsMarkLadderOf),
  )
}

/** Thousandths of an energy unit as units. */
function unitsOfMilli(milli: number): Money {
  return div(fromSafeInteger(milli), fromSafeInteger(MILLI_PER_UNIT))
}
