/**
 * The pacing bot's boiler rule (Systems' rows on #553, section 3, ticket 553): buy a boiler step
 * while the energy cap cuts the average full-hold load by more than 20%,
 * `sum_b units_b * (1 - load_b / hold) / sum_b units_b > 0.20`, evaluated at the rig's current
 * drill, tip, engine and hold. A band's ore is weighted by its share of the radius (the band
 * thresholds of #6), the share Systems' model gives each band's units; `load_b / hold` is the
 * share of a full hold the planned trip to the band loads (`holdShareLoadedOf`). Bands the bot
 * cannot plan a trip to (dug out, or past the tip) are left out, as the model leaves out a band
 * the drill cannot cut.
 *
 * Without the rule the marginal rule starves the boiler (Systems' B6: P2 to P5 run 27, 36, 52 and
 * 38 minutes), so it runs ahead of the other track rules; when its step is not affordable the
 * other buys go on (`botShopping.ts`).
 */
import { BAND_START_DEPTH_PERCENT } from '../world/planetTable'
import type { UpgradeLevels } from '../economy/vehicleStats'
import type { MineLayout } from './mineLayout'
import { fullTankMeans, holdShareLoadedOf } from './tripEstimate'

/** Systems' threshold: the energy cap cuts the average full-hold load by more than 20%. */
const SHORT_LOAD_SHARE = 1 / 5
const FULL_DEPTH_PERCENT = 100
const BANDS = [1, 2, 3, 4, 5]

/** Whether the bot buys a boiler step now: the tank cuts its average load by more than 20%. */
export function isBoilerStepDue(layout: MineLayout, levels: UpgradeLevels): boolean {
  return shortLoadShareOf(layout, levels) > SHORT_LOAD_SHARE
}

/** The average share of a full hold the tank leaves unloaded, over the bands with a trip. */
export function shortLoadShareOf(layout: MineLayout, levels: UpgradeLevels): number {
  const means = fullTankMeans(levels)
  let weighed = 0
  let short = 0
  for (const band of BANDS) {
    const loaded = holdShareLoadedOf(layout, means, band)
    if (loaded === null) continue
    weighed += bandWeightOf(band)
    short += bandWeightOf(band) * (1 - loaded)
  }
  return weighed === 0 ? 0 : short / weighed
}

/** The band's share of the radius in percent: 8, 27, 30, 25 and 10 (#6 band thresholds). */
function bandWeightOf(band: number): number {
  const starts = [0, ...BAND_START_DEPTH_PERCENT, FULL_DEPTH_PERCENT]
  return starts[band] - starts[band - 1]
}
