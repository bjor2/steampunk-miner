/**
 * Slice drill gear (GD lock on #205, ticket 234): side cutters widen the bore and a reach boom cuts
 * past the bit. Each source answers the gear one player's drill cuts with, read from its own
 * section (null when it has nothing to say); the kernel folds the answers through `drillGearCaps`
 * and the drill path (`drillGearCut.ts`) lists the cells only after `canMine`. With nothing
 * registered the drill cuts exactly as before.
 */
import type { AuthorityState } from '../authority/authorityState'
import { foldDrillGear, type DrillGear, type DrillGearAsk } from '../economy/drillGearCaps'
import { ECONOMY } from '../economy/economy'
import { defineRegistry, entriesOf } from './seal'

export interface DrillGearSource {
  id: string
  /** The gear this player's drill cuts with now; null to add nothing. */
  gearOf(state: AuthorityState, playerId: string): DrillGearAsk | null
}

export const DRILL_GEAR_REGISTRY = defineRegistry<DrillGearSource>('drillGear')

/** The player's drill gear after the caps; null when no source adds a cell. */
export function drillGearOf(state: AuthorityState, playerId: string): DrillGear | null {
  const sources = entriesOf(DRILL_GEAR_REGISTRY)
  if (sources.length === 0) return null
  return foldDrillGear(asksOf(sources, state, playerId), ECONOMY.drillGearCaps)
}

function asksOf(
  sources: readonly DrillGearSource[],
  state: AuthorityState,
  playerId: string,
): DrillGearAsk[] {
  return sources
    .map((source) => source.gearOf(state, playerId))
    .filter((ask): ask is DrillGearAsk => ask !== null)
}
