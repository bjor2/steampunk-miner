/**
 * The host's stamp at the player's bore (GD lock on #662 Part B, ticket 749): the bare stamp grown
 * to the width level the host derives this tick from what the player owns
 * (`registries/boreWidth.ts`). There is no client width field: the carve reads this, while the cut
 * gate and its leading slab read the bare stamp (`cutFollowRead.ts`), so time to core is the bare
 * bore's and only the cut's width changes.
 */
import { widthLevelOf } from '../registries/boreWidth'
import { aimOfPose } from '../vehicle/aim'
import { stampAtWidthLevel } from '../vehicle/boreWidthStamp'
import type { VehiclePose } from '../vehicle/vehiclePose'
import type { DiscStamp } from '../world/stampShape'
import type { AuthorityState } from './authorityState'

/** `stamp`, built at `pose`, grown to the player's bore now. */
export function boreStampOf(
  state: AuthorityState,
  playerId: string,
  stamp: DiscStamp,
  pose: VehiclePose,
): DiscStamp {
  return stampAtWidthLevel(stamp, aimOfPose(pose), widthLevelOf(state, playerId))
}
