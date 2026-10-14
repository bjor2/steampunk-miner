/**
 * The mobility lane's P16 fork (GD lock on #255, build 3, ticket 268): two exclusive branches,
 * `tech.mobility.fork.agile` and `.armoured`, picked with `tech-tree.choose_fork` and acting while
 * active, on ticket 233's seams. Both are tree-only capabilities: no store item, no slot.
 *
 * - **Agile** (air trim vanes): being airborne is rewarded. Off the ground the miner gains lift and
 *   drive (`vehicleMotionEffects`, under the kernel's +2000 bp cap), and a grapple reels at the
 *   boosted top speed, so reels and boosts chain through the air.
 * - **Armoured** (plated skirts): stay grounded and take hits on purpose. On the ground an enemy's
 *   hit and a collapse's crush land at the grounded share (`hullDamageIntercepts`, above the
 *   kernel's floor). It leans on the `shields` row: once that row's `FeatureUnlocked` has come, a
 *   steam curtain it raises stands longer (`mobilityUses.ts`); before, it does nothing more.
 *
 * Footing is the tile under the miner's centre along its down vector: solid ground, or air. The
 * cards name neither the leaned row nor its item, and no ore family (the #255 guard).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { isFeatureUnlocked } from '../../../systems/authority/featureUnlocks'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { HullDamageIntercept } from '../../../systems/registries/hullDamageIntercepts'
import type { VehicleMotionEffectSource } from '../../../systems/registries/vehicleMotionEffects'
import { FACING, noseTileOf } from '../../../systems/vehicle/vehiclePose'
import { isSolidCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { activeForkBranchOf, forkPairOf, type ForkPair, type TechLane } from '../../tech-tree'
import { MOBILITY_FORK_NUMBERS as N } from './mobilityForkEconomy'

const LANE: TechLane = 'mobility'

export const AGILE_BRANCH = 'agile'
export const ARMOURED_BRANCH = 'armoured'
export const AIR_TRIM_ID = 'passive.air_trim'
export const PLATED_SKIRTS_ID = 'passive.plated_skirts'

/** The scheduled row Armoured leans on (#255 lock: "Armoured on `shields` at P22"). */
export const ARMOURED_LEANED_ROW = 'shields'

export type Footing = 'grounded' | 'airborne'

export const MOBILITY_FORK: ForkPair = forkPairOf(LANE, [
  {
    branch: AGILE_BRANCH,
    name: 'Air trim vanes',
    iconId: 'icon-track-engine',
    prereqs: [],
    unlocks: AIR_TRIM_ID,
    description: 'Brass vanes catch the updraught, so the miner steers best off the ground.',
    label: 'horizontal',
  },
  {
    branch: ARMOURED_BRANCH,
    name: 'Plated skirts',
    iconId: 'icon-track-hull',
    prereqs: [],
    unlocks: PLATED_SKIRTS_ID,
    description: 'Riveted skirts brace the miner low, so it shrugs off blows on solid ground.',
    label: 'horizontal',
  },
])

export const AGILE_AIR_MOTION: VehicleMotionEffectSource = {
  id: 'mobility.agile-air-trim',
  effectOf: (state, playerId) =>
    isBranchActive(state, playerId, AGILE_BRANCH) && footingOf(state, playerId) === 'airborne'
      ? { liftBp: N.agile.airBoostBp, driveBp: N.agile.airBoostBp }
      : null,
}

export const ARMOURED_GROUNDED_INTERCEPT: HullDamageIntercept = {
  id: 'mobility.armoured-skirts',
  damageScaleBpOf: (state, playerId) =>
    isBranchActive(state, playerId, ARMOURED_BRANCH) && footingOf(state, playerId) === 'grounded'
      ? N.armoured.groundedDamageScaleBp
      : null,
}

/** The ticks an Armoured miner's steam curtain stands beyond its own: none before `shields`. */
export function armouredCurtainTicksOf(state: AuthorityState, playerId: string): number {
  if (!isBranchActive(state, playerId, ARMOURED_BRANCH)) return 0
  return isFeatureUnlocked(state, ARMOURED_LEANED_ROW) ? N.armoured.curtainExtraTicks : 0
}

/** Solid ground under the miner, or air; null with no pose or no planet. */
export function footingOf(state: AuthorityState, playerId: string): Footing | null {
  const pose = vehicleOf(state, playerId).pose
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null) return null
  const under = noseTileOf({ ...pose, facing: FACING.down })
  return isSolidCell(cellAt(state.world, params, under)) ? 'grounded' : 'airborne'
}

function isBranchActive(state: AuthorityState, playerId: string, branch: string): boolean {
  return activeForkBranchOf(state, playerId, LANE) === branch
}
