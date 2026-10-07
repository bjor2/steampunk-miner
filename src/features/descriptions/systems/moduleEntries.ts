/**
 * The Upgrade bay's one-off and levelled gear beside the tracks, and the refinery's slots (#164
 * side table): casing (#41), lining types (#113, #159 example 2's flavour), guns (#107), blasting
 * charges and their rack (#109), refinery slots (#105). Every figure is a kernel stat function at
 * the level the card is drawn for: the casing grade, the gun level, the rack's slot level, the
 * platform's slot count. Guns and the rack stop at their top level, where the line has no next.
 */
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../../constants/physics'
import {
  blastRadiusMm,
  chargeFuseTicks,
  rackCapacity,
  rackMaxSlotLevel,
} from '../../../systems/economy/blastingCharges'
import { casingHardness } from '../../../systems/economy/casingGrades'
import { gunMaxLevel, gunRangeTiles, gunShotsPerSecond } from '../../../systems/economy/gunStats'
import { liningTypePriceMultiplier } from '../../../systems/economy/heatEconomy'
import { refineSeconds, refinerySlotsMax } from '../../../systems/economy/refineryEconomy'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import { KERNEL_ITEMS, liningItemOf } from '../../../systems/registries/kernelItems'
import { fixedLine, kernelEntryOf, levelledLine, type DescribedEntry } from './kernelEntry'

/** One flavour per buyable lining type; a type without one fails the coverage spec. */
const LINING_FLAVOURS: Readonly<Record<string, string>> = {
  refractory: 'Firebrick casing that keeps lava out and your tunnel cool.',
}

const NO_GUNS = 0

export function moduleEntries(): readonly DescribedEntry[] {
  return [
    kernelEntryOf(
      KERNEL_ITEMS.casing,
      'Tougher casing rings line the shaft, so deeper bands stay open.',
      [
        levelledLine('Casing grade', 'linearInt', (grade) => grade),
        levelledLine('Lining hardness', 'geometric', (grade, ctx) =>
          casingHardness(ctx.planetIndex, grade),
        ),
      ],
    ),
    ...liningEntries(),
    kernelEntryOf(
      KERNEL_ITEMS.guns,
      'Swivel-mounted brass barrels that fire at whatever bites the miner.',
      [
        {
          ...levelledLine('Shots per second', 'saturating', shotsPerSecondAt, gunMaxLevel),
          cap: () => gunShotsPerSecond(gunMaxLevel()),
        },
        fixedLine('Range in tiles', 'linearInt', gunRangeTiles),
      ],
    ),
    kernelEntryOf(
      KERNEL_ITEMS.charges,
      'Packed blasting charges that crack open rock the drill cannot shift.',
      [
        fixedLine('Blast radius in metres', 'linearInt', blastRadiusMetres),
        fixedLine('Fuse in seconds', 'linearInt', fuseSeconds),
      ],
    ),
    kernelEntryOf(
      KERNEL_ITEMS.chargeRack,
      'Another sprung clip on the rack, so one more charge rides along.',
      [
        levelledLine(
          'Rack slots',
          'linearInt',
          (slotLevel) => rackCapacity(slotLevel),
          rackMaxSlotLevel,
        ),
      ],
    ),
    kernelEntryOf(
      KERNEL_ITEMS.refinerySlot,
      'One more crucible in the yard, so another batch can cook at once.',
      [
        levelledLine('Refinery slots', 'linearInt', (slots) => slots, refinerySlotsMax),
        fixedLine('Refine time in seconds', 'linearInt', refineSeconds),
      ],
    ),
  ]
}

function liningEntries(): readonly DescribedEntry[] {
  return Object.entries(LINING_FLAVOURS).map(([liningType, flavour]) =>
    kernelEntryOf(liningItemOf(liningType), flavour, [
      fixedLine('Lining charge multiplier', 'geometric', () =>
        liningTypePriceMultiplier(liningType),
      ),
    ]),
  )
}

/** No guns before the mount: the card's next line is the mount's rate. */
function shotsPerSecondAt(gunLevel: number): number {
  return gunLevel === NO_GUNS ? 0 : gunShotsPerSecond(gunLevel)
}

function blastRadiusMetres(): Money {
  return div(fromSafeInteger(blastRadiusMm()), fromSafeInteger(MM_PER_METRE))
}

function fuseSeconds(): Money {
  return div(fromSafeInteger(chargeFuseTicks()), fromSafeInteger(TICKS_PER_SECOND))
}
