/**
 * The charge of a pose report's own cut on the density it removed, with an exact integer carry
 * (ticket 535, A6 "Option L", the TD shape 6228682000 as VS 6228674086 and the GD 6228674068
 * ruled it). The swept cut clears every cell it pays for in full, so its energy per unit of law
 * work is a constant; the report carve pays the same price for what it removed: every sample it
 * carved adds `removal x law time` to a tally (`groundEdit.ts`, the law time in sub-steps of a
 * tick as `drillSubStepsOfCells` reads it), and the tally is charged as the swept price, the part
 * under one quantum carried on the vehicle. A rim cell cut across several reports is then paid in
 * exact proportion to what each removed, whichever reports touch it, so the sum telescopes and no
 * rig lands above or below swept except by quantization.
 *
 * - Law work is counted in density sub-steps: one density unit removed from a cell whose law
 *   time is one sub-step. A whole cell (16 samples of 255) at a law time of one tick (60
 *   sub-steps) is `LAW_WORK_PER_DRILL_TICK`, the work a drill tick does, which costs the drill's
 *   quanta a tick (`ENERGY_QUANTA_PER_TICK.drill`).
 * - Energy: `owed = carry + tally x quanta a tick`, paid `floor(owed / D)` and never more than
 *   the tank holds, the rest carried. The tally is share-weighted in basis points, so a drill-gear
 *   cell pays at its gear share as the swept cut prices it (`cellDigEnergy.ts`); `D` carries the
 *   same factor. A cut the tank cannot pay for keeps its debt on the carry; it is paid by the next
 *   cut, never forgiven, so the carry is below `D` unless the tank clamped it.
 * - Heat: the same tally, unweighted, is heated in whole drill ticks, `floor(owed / D_heat)`, the
 *   rest carried, as the swept cut heats from its steps' summed dig time (`sweptCut.ts`); between
 *   commands the heat carry is below one tick.
 * - The swept cut pays its tally in the rig's drill quantum (ticket 558): the carry is counted in
 *   the larger of its own quantum and the tally's, both whole multiples of the smaller, so it stays
 *   exact; the carry's quantum is kept beside it (`cutEnergyCarryQuantum`) when above the base.
 * - Both carries are absent at 0, so a vehicle that never drilled by report digests as before.
 *   They are dropped at planet entry, by the tow and by a new game (`planetEntry.ts`,
 *   `vehicleTransitions.ts`, `newVehicleState`).
 */
import { BASIS_POINTS, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { SAMPLES_PER_CELL, SOLID_DENSITY } from '../world/sampleGrid'
import { subStepsInQuantum } from './drillQuantum'
import { ENERGY_QUANTA_PER_TICK } from './energyQuanta'

/** The law work of one drill tick in density sub-steps of `quantum`: a whole cell in one tick. */
export function lawWorkPerDrillTickAt(quantum: number): number {
  return SAMPLES_PER_CELL * SOLID_DENSITY * quantum
}

/** The energy carry's denominator in `quantum`: a drill tick's law work, in basis points. */
export function cutEnergyDenominatorAt(quantum: number): number {
  return lawWorkPerDrillTickAt(quantum) * BASIS_POINTS
}

/** The law work of one drill tick at the base quantum. */
export const LAW_WORK_PER_DRILL_TICK = lawWorkPerDrillTickAt(DRILL_SUBSTEPS_PER_TICK)

/** The energy carry's denominator at the base quantum. */
export const CUT_ENERGY_DENOMINATOR = cutEnergyDenominatorAt(DRILL_SUBSTEPS_PER_TICK)

/**
 * What a cut removed, in density sub-steps of `quantum` a tick (the base, or the swept rig's drill
 * quantum, ticket 558): as is, and weighted by each cell's energy share.
 */
export interface LawWorkTally {
  law: number
  /** `law` with every cell at its share of the drill's rate, in basis points. */
  lawBp: number
  quantum: number
}

export const NO_LAW_WORK: LawWorkTally = { law: 0, lawBp: 0, quantum: DRILL_SUBSTEPS_PER_TICK }

interface CarriesCut {
  cutEnergyCarry?: number
  /** The quantum the energy carry counts in, when above the base (ticket 558). */
  cutEnergyCarryQuantum?: number
  cutHeatCarry?: number
}

/** The quanta a cut pays now, and the vehicle carrying what is left owed. */
export interface CutEnergyPayment<V extends CarriesCut> {
  quanta: number
  vehicle: V
}

/**
 * Pays `tally` from a tank of `tank` quanta: the whole quanta it comes to with the carry, clamped
 * to the tank, the rest (and any debt the clamp left) carried; the heat carry takes the tally,
 * which the report's cut counts at the base quantum.
 */
export function payLawWork<V extends CarriesCut>(
  vehicle: V,
  tally: LawWorkTally,
  tank: number,
): CutEnergyPayment<V> {
  const heated = withCutHeatCarry(vehicle, (vehicle.cutHeatCarry ?? 0) + tally.law)
  return payLawWorkEnergy(heated, tally, tank)
}

/**
 * `payLawWork`'s energy alone (ticket 540, the TD seam 6234992964 as VS confirmed it): the same
 * quanta, clamp and carry, the heat carry left as it was. The swept cut heats from its steps'
 * summed dig time (`sweptCut.ts`), and nothing on its path drains the heat carry, so a tally
 * written there would grow until the tow. Both paths share the one energy carry in one unit, so a
 * vehicle that switches path mid-trip pays no quantum twice and loses none.
 */
export function payLawWorkEnergy<V extends CarriesCut>(
  vehicle: V,
  tally: LawWorkTally,
  tank: number,
): CutEnergyPayment<V> {
  const quantum = Math.max(carryQuantumOf(vehicle), tally.quantum)
  const owed = carryIn(vehicle, quantum) + lawBpIn(tally, quantum) * ENERGY_QUANTA_PER_TICK.drill
  const denominator = cutEnergyDenominatorAt(quantum)
  const quanta = Math.min(tank, Math.floor(owed / denominator))
  return { quanta, vehicle: withCutEnergyCarry(vehicle, owed - quanta * denominator, quantum) }
}

/** The quantum the vehicle's energy carry counts in. */
function carryQuantumOf(vehicle: CarriesCut): number {
  return vehicle.cutEnergyCarryQuantum ?? DRILL_SUBSTEPS_PER_TICK
}

/** The energy carry in `quantum`, at least its own: a whole multiple, so exact. */
function carryIn(vehicle: CarriesCut, quantum: number): number {
  return subStepsInQuantum(vehicle.cutEnergyCarry ?? 0, carryQuantumOf(vehicle), quantum)
}

/** The tally's share-weighted work in `quantum`, at least its own: exact. */
function lawBpIn(tally: LawWorkTally, quantum: number): number {
  return subStepsInQuantum(tally.lawBp, tally.quantum, quantum)
}

/** The whole drill ticks the heat carry heats for, and the vehicle keeping the rest. */
export function splitCutHeatCarry<V extends CarriesCut>(
  vehicle: V,
): { heatTicks: number; vehicle: V } {
  const owed = vehicle.cutHeatCarry ?? 0
  const heatTicks = Math.floor(owed / LAW_WORK_PER_DRILL_TICK)
  return { heatTicks, vehicle: withCutHeatCarry(vehicle, owed % LAW_WORK_PER_DRILL_TICK) }
}

/** The vehicle with no carry: its keys left out, as before any report cut. */
export function withoutCutCarry<V extends CarriesCut>(
  vehicle: V,
): Omit<V, 'cutEnergyCarry' | 'cutEnergyCarryQuantum' | 'cutHeatCarry'> {
  const {
    cutEnergyCarry: _energy,
    cutEnergyCarryQuantum: _quantum,
    cutHeatCarry: _heat,
    ...rest
  } = vehicle
  return rest
}

/** The vehicle with no energy carry, nor the quantum it counted in. */
export function withoutCutEnergyCarry<V extends CarriesCut>(
  vehicle: V,
): Omit<V, 'cutEnergyCarry' | 'cutEnergyCarryQuantum'> {
  const { cutEnergyCarry: _energy, cutEnergyCarryQuantum: _quantum, ...rest } = vehicle
  return rest
}

export function hasCutCarry(vehicle: CarriesCut): boolean {
  return vehicle.cutEnergyCarry !== undefined || vehicle.cutHeatCarry !== undefined
}

/** The carry in `quantum`: left out at 0, its quantum left out at the base. */
function withCutEnergyCarry<V extends CarriesCut>(vehicle: V, carry: number, quantum: number): V {
  const rest = withoutCutEnergyCarry(vehicle) as V
  if (carry === 0) return rest
  if (quantum === DRILL_SUBSTEPS_PER_TICK) return { ...rest, cutEnergyCarry: carry }
  return { ...rest, cutEnergyCarry: carry, cutEnergyCarryQuantum: quantum }
}

function withCutHeatCarry<V extends CarriesCut>(vehicle: V, carry: number): V {
  if (carry === 0) {
    const { cutHeatCarry: _heated, ...rest } = vehicle
    return rest as V
  }
  return { ...vehicle, cutHeatCarry: carry }
}
