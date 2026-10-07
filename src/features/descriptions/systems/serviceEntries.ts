/**
 * The platform services' and bays' card entries (#164 side table; #159 service template "Restores
 * hull a → b" / "Fills energy a → b" / "Travel to planet P", bay template "Adds <bay>, then its key
 * stat lines"). A service is bought whole, not by level, so its lines are fixed figures read from
 * the vehicle the snapshot view shows: what the repair or recharge brings it up to, the batch the
 * refinery takes, the planet the lift goes to. The price stays the kernel's line (#159 line 3).
 */
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { energyUnitPrice } from '../../../systems/economy/planetCharges'
import {
  refineBatchCap,
  refineSeconds,
  refinerySlotsStart,
} from '../../../systems/economy/refineryEconomy'
import { vehicleStatsAt, type VehicleStats } from '../../../systems/economy/vehicleStats'
import type { ItemCtx } from '../../../systems/registries/itemDescriber'
import type { ItemSnapshotView } from '../../../systems/registries/itemSnapshotView'
import { bayItemOf, KERNEL_ITEMS } from '../../../systems/registries/kernelItems'
import type { DescribedStatLineSpec } from './describedLineSpec'
import { fixedLine, kernelEntryOf, type DescribedEntry } from './kernelEntry'

const NEXT_PLANET_STEP = 1

const REPAIRED_HULL = fixedLine(
  'Hull restored to',
  'geometric',
  ({ view }) => vehicleStatsOf(view).hullMax,
)
const RECHARGED_ENERGY = fixedLine(
  'Energy filled to',
  'linearInt',
  ({ view }) => vehicleStatsOf(view).energyMax,
)
const REFINE_TIME = fixedLine('Refine time in seconds', 'linearInt', refineSeconds)

export function serviceEntries(): readonly DescribedEntry[] {
  return [
    kernelEntryOf(
      KERNEL_ITEMS.repair,
      'Platform fitters hammer out the dents and patch the plate whole.',
      [REPAIRED_HULL],
    ),
    kernelEntryOf(
      KERNEL_ITEMS.recharge,
      'A steam line from the platform tops the boiler back to a full gauge.',
      [RECHARGED_ENERGY],
    ),
    kernelEntryOf(
      KERNEL_ITEMS.quickService,
      'Sell the hold, mend the hull and fill the boiler in one stop.',
      [REPAIRED_HULL, RECHARGED_ENERGY],
    ),
    kernelEntryOf(
      KERNEL_ITEMS.refine,
      'The crucibles smelt a batch of ore so it sells for more than raw.',
      [refineBatchLine(), REFINE_TIME],
    ),
    kernelEntryOf(
      KERNEL_ITEMS.travel,
      'The Guild ferries the miner and its gear out to the next planet.',
      [fixedLine('Travel to planet', 'linearInt', nextPlanetOf)],
    ),
  ]
}

export function bayEntries(): readonly DescribedEntry[] {
  return [
    kernelEntryOf(bayItemOf('sell'), 'The Assay and Exchange weighs your ore and pays in coin.', [
      fixedLine('Energy price per unit', 'geometric', ({ planetIndex }) =>
        energyUnitPrice(planetIndex),
      ),
    ]),
    kernelEntryOf(
      bayItemOf('upgrade'),
      'The Engineering Works turntable, where fitters bolt new gear on.',
      [fixedLine('Upgrade tracks', 'linearInt', () => UPGRADE_IDS.length)],
    ),
    kernelEntryOf(
      bayItemOf('refinery'),
      'A yard of crucibles that smelts ore into refined stock while you dig.',
      [fixedLine('Refinery slots', 'linearInt', refinerySlotsStart), REFINE_TIME],
    ),
  ]
}

function refineBatchLine(): DescribedStatLineSpec {
  return fixedLine('Batch cap in units', 'linearInt', ({ view }) =>
    refineBatchCap(vehicleStatsOf(view).cargoCapacity),
  )
}

/** The vehicle's stats at its stored steps, as `statsOfVehicle` reads them for the authority. */
function vehicleStatsOf(view: ItemSnapshotView): VehicleStats {
  return vehicleStatsAt(view.levels)
}

function nextPlanetOf({ planetIndex }: ItemCtx): number {
  return planetIndex + NEXT_PLANET_STEP
}
