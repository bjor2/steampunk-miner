/**
 * The return reserve of #33 section 5 (pure, display and planning only, not authority state): the
 * energy a straight climb home from `depthTiles` costs, at the thrust rate (1.5 units a second,
 * #6) and the engine's top speed, rounded up to whole units:
 *
 *   returnReserve = ceil(depthTiles * 1.5 / speedMax)      at level 0 and depth 100: 25 units
 *
 * The HUD's low-energy levels and the pacing bot's "never leave the pad without it" rule (#29)
 * both read it.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { ENERGY_QUANTA_PER_TICK } from './energyQuanta'

export function returnReserveUnits(depthTiles: number, speedMax: number): number {
  const thrustQuantaPerSecond = ENERGY_QUANTA_PER_TICK.thrust * TICKS_PER_SECOND
  return Math.ceil((depthTiles * thrustQuantaPerSecond) / (ENERGY_QUANTA_PER_UNIT * speedMax))
}
