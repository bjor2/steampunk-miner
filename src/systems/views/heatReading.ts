/**
 * The HUD's heat gauge (#113 Visibility): on a heat planet only, the gauge 0 to 100 with its
 * needle, "THROTTLED" while the drill is held back above `throttleAt`, and the gauge's icon. The
 * state is said in text, never by colour alone.
 */
import { HEAT_GAUGE_ICON_ID } from '../art/artIds'
import type { AuthorityState } from '../authority/authorityState'
import { isOverheated } from '../authority/heatRules'
import { hazardArchetypeOn } from '../economy/heatEconomy'
import { floor, toCanonical, toSafeInteger } from '../money'
import { heatPointsOf, heatUnitsOfPoints } from '../vehicle/vehicleHeat'
import type { GaugeReading } from './hudModel'

export interface HeatReading extends GaugeReading {
  iconId: string
  isThrottled: boolean
  throttledText: string
}

export const THROTTLED_TEXT = 'THROTTLED'

const PERMILLE = 1000

/** Null off the heat planets. */
export function heatReadingOf(state: AuthorityState, playerId: string): HeatReading | null {
  const archetype = hazardArchetypeOn(state.planet.index)
  if (archetype === null) return null
  const { heat } = state.players[playerId].vehicle
  const points = heatPointsOf(heat.level)
  const isThrottled = isOverheated(state.planet.index, heat)
  return {
    text: `${toSafeInteger(floor(points))} / ${archetype.gaugeMax}`,
    exact: toCanonical(points),
    permille: Math.floor((heat.level * PERMILLE) / heatUnitsOfPoints(archetype.gaugeMax)),
    iconId: HEAT_GAUGE_ICON_ID,
    isThrottled,
    throttledText: isThrottled ? THROTTLED_TEXT : '',
  }
}
