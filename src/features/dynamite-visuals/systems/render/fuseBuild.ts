/**
 * The fuse-spark build (D8, ticket 868, stage 1 of a blast): a burning fuse throws its type's
 * sparks at the look row's rate, then `FUSE_BUILD_PEAK` times that by the last tick, building over
 * its last `FUSE_BUILD_SECONDS`. A remote charge has no fuse (ticks left infinite) and never builds.
 */
import { TICKS_PER_SECOND } from '../../../../constants/physics'
import { FUSE_BUILD_PEAK, FUSE_BUILD_SECONDS } from './blastLookConstants'

const BUILD_TICKS = FUSE_BUILD_SECONDS * TICKS_PER_SECOND

/** The factor on the fuse's spark rate with `ticksLeft` to go: 1 until the build, the peak at 0. */
export function fuseBuildOf(ticksLeft: number): number {
  if (!Number.isFinite(ticksLeft) || ticksLeft >= BUILD_TICKS) return 1
  const built = 1 - Math.max(0, ticksLeft) / BUILD_TICKS
  return 1 + (FUSE_BUILD_PEAK - 1) * built
}
