/**
 * The aether condenser's effect (#263 "Condense", kernel half #360): burn stored heat down into
 * energy at the `src/data/aetheric.json` ratio, stopping at full charge. Whole exchanges only, so
 * heat and energy stay integers and a remainder smaller than one exchange stays as heat. One
 * division and one min per call; nothing calls it until the power-up is registered (#263).
 */
import AETHERIC_TUNING from '../../data/aetheric.json'

/** Heat units (`HEAT_UNITS_PER_POINT` per gauge point) burnt for one energy quantum (1/240 unit). */
export type CondenseRatio = number

export const CONDENSE_RATIO: CondenseRatio = AETHERIC_TUNING.heatUnitsPerEnergyQuantum

export interface CondensedCharge {
  /** Heat units left after the burn. */
  heat: number
  /** Energy quanta after the burn, never above `energyMax`. */
  energy: number
}

export function condense(
  heat: number,
  energy: number,
  energyMax: number,
  ratio: CondenseRatio,
): CondensedCharge {
  const quanta = Math.min(Math.floor(heat / ratio), roomInTank(energy, energyMax))
  return { heat: heat - quanta * ratio, energy: energy + quanta }
}

function roomInTank(energy: number, energyMax: number): number {
  return Math.max(0, energyMax - energy)
}
