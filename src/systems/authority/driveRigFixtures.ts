/**
 * A scripted rig's drive (Bjor's ruling on #723): a sideways cut moves at `min(vCut, speedMax)`, so
 * a rig a spec names by its cut speed cuts sideways at that speed only with an engine whose top
 * speed reaches it. Down and up cuts are the drill's alone and need none. Test support, never run
 * in play.
 */
import { engineStats } from '../economy/vehicleStats'

/** Far past any rig a spec cuts with: 6 x 1.05^400 m/s. */
const MAX_ENGINE_STEP = 400

/** The fewest engine purchases whose top speed reaches `speedMps`. */
export function engineStepReaching(speedMps: number): number {
  for (let step = 0; step <= MAX_ENGINE_STEP; step++) {
    if (engineStats(step).speedMax >= speedMps) return step
  }
  throw new Error(`no engine up to ${MAX_ENGINE_STEP} purchases reaches ${speedMps} m/s`)
}

/** The rig's levels with the weakest engine whose drive reaches `speedMps`. */
export function withDriveReaching(
  levels: Readonly<Record<string, number>>,
  speedMps: number,
): Record<string, number> {
  return { ...levels, engine: engineStepReaching(speedMps) }
}
