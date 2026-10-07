/**
 * The six upgrade tracks' card entries (#164 side table; #159 example lines 1-3 for the tip,
 * boiler and cargo flavour). Each stat line reads the kernel's own stat function at the owned
 * level and the next (#7, `vehicleStats.ts`), its kind from `trackKindOf`. The engine's three lines
 * saturate, so they show the cap from the engine's range in `economy.json`.
 */
import { ECONOMY } from '../../../systems/economy/economy'
import type { BoundedRange, UpgradeId } from '../../../systems/economy/economyDefinition'
import { trackKindOf } from '../../../systems/economy/trackKind'
import {
  cargoCapacity,
  drillPower,
  drillTip,
  energyMax,
  engineStats,
  hullMax,
  type EngineStats,
} from '../../../systems/economy/vehicleStats'
import type { Money } from '../../../systems/money'
import { trackItemOf } from '../../../systems/registries/kernelItems'
import type { DescribedStatLineSpec } from './describedLineSpec'
import { kernelEntryOf, levelledLine, type DescribedEntry } from './kernelEntry'

type EngineStat = keyof EngineStats

export function trackEntries(): readonly DescribedEntry[] {
  return [
    trackEntry('drill_power', 'Heavier gearing drives the drill head harder through every band.', [
      trackLine('drill_power', 'Drill power', drillPower),
    ]),
    trackEntry('drill_tip', 'A harder-tempered bit that bites rock the old one only scratched.', [
      trackLine('drill_tip', 'Drill tip', drillTip),
    ]),
    trackEntry('engine', 'Bigger pistons and a lighter flywheel push the miner along faster.', [
      engineLine('speedMax', 'Top speed'),
      engineLine('accel', 'Acceleration'),
      engineLine('thrustToWeight', 'Thrust to weight'),
    ]),
    trackEntry('boiler', 'More pressure in the drum, more time below before the gauge drops.', [
      trackLine('boiler', 'Energy', energyMax),
    ]),
    trackEntry('cargo_hold', 'Wider bins and stouter rivets, so you haul more ore per trip.', [
      trackLine('cargo_hold', 'Cargo', cargoCapacity),
    ]),
    trackEntry('hull', 'Thicker riveted plate that shrugs off the knocks the old hull felt.', [
      trackLine('hull', 'Hull', hullMax),
    ]),
  ]
}

function trackEntry(
  upgradeId: UpgradeId,
  flavour: string,
  statLines: readonly DescribedStatLineSpec[],
): DescribedEntry {
  return kernelEntryOf(trackItemOf(upgradeId), flavour, statLines)
}

function trackLine(
  upgradeId: UpgradeId,
  label: string,
  statAt: (level: number) => number | Money,
): DescribedStatLineSpec {
  return levelledLine(label, trackKindOf(upgradeId), (level) => statAt(level))
}

function engineLine(stat: EngineStat, label: string): DescribedStatLineSpec {
  return {
    ...trackLine('engine', label, (level) => engineStats(level)[stat]),
    cap: () => engineRangeOf(stat).max,
  }
}

function engineRangeOf(stat: EngineStat): BoundedRange {
  const effect = ECONOMY.upgrades.find((upgrade) => upgrade.id === 'engine')?.effect
  if (effect?.family !== 'saturating') throw new RangeError('the engine track saturates (#7)')
  return effect.stats[stat]
}
