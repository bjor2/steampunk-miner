/**
 * The six upgrade tracks' card entries (#164 side table; #159 example lines 1-3 for the tip,
 * boiler and cargo flavour). Each stat line reads the kernel's own stat function (#7,
 * `vehicleStats.ts`) at the stored step, the next step and the next major (#181), its kind from
 * `trackKindOf`. The engine's three lines grow per purchase with no cap since ticket 553 (Systems'
 * Proposal 1 on #551), so they show none. The last line is the step as the bay prints it, "13 · 4/9".
 */
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import { trackKindOf } from '../../../systems/economy/trackKind'
import {
  cargoCapacityAtStep,
  drillPowerAtStep,
  drillTipAtStep,
  energyMaxAtStep,
  engineStatsAtStep,
  hullMaxAtStep,
  type EngineStats,
} from '../../../systems/economy/vehicleStats'
import type { Money } from '../../../systems/money'
import { trackItemOf } from '../../../systems/registries/kernelItems'
import type { DescribedStatLineSpec } from './describedLineSpec'
import { kernelEntryOf, stepLevelLine, steppedLine, type DescribedEntry } from './kernelEntry'

type EngineStat = keyof EngineStats

export function trackEntries(): readonly DescribedEntry[] {
  return [
    trackEntry('drill_power', 'Heavier gearing drives the drill head harder through every band.', [
      trackLine('drill_power', 'Drill power', drillPowerAtStep),
    ]),
    trackEntry('drill_tip', 'A harder-tempered bit that bites rock the old one only scratched.', [
      trackLine('drill_tip', 'Drill tip', drillTipAtStep),
    ]),
    trackEntry('engine', 'Drives faster, and fits heavier tracks and wheels.', [
      engineLine('speedMax', 'Top speed'),
      engineLine('accel', 'Acceleration'),
      engineLine('thrustToWeight', 'Thrust to weight'),
    ]),
    trackEntry('boiler', 'More pressure in the drum, more time below before the gauge drops.', [
      trackLine('boiler', 'Energy', energyMaxAtStep),
    ]),
    trackEntry('cargo_hold', 'Wider bins and stouter rivets, so you haul more ore per trip.', [
      trackLine('cargo_hold', 'Cargo', cargoCapacityAtStep),
    ]),
    trackEntry('hull', 'Thicker riveted plate that shrugs off the knocks the old hull felt.', [
      trackLine('hull', 'Hull', hullMaxAtStep),
    ]),
  ]
}

function trackEntry(
  upgradeId: UpgradeId,
  flavour: string,
  statLines: readonly DescribedStatLineSpec[],
): DescribedEntry {
  return kernelEntryOf(trackItemOf(upgradeId), flavour, [...statLines, stepLevelLine()])
}

function trackLine(
  upgradeId: UpgradeId,
  label: string,
  statAtStep: (step: number) => number | Money,
): DescribedStatLineSpec {
  return steppedLine(label, trackKindOf(upgradeId), statAtStep)
}

function engineLine(stat: EngineStat, label: string): DescribedStatLineSpec {
  return trackLine('engine', label, (step) => engineStatsAtStep(step)[stat])
}
