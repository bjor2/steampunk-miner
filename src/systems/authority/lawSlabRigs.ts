/**
 * The rigs the slab lanes cut with (ticket 535's reference rows, VS 6230602042; ticket 540's swept
 * rows, Systems 6231144515): VS's rigs named by their band-1 cut speed, as the loop lane names them
 * (`physics/exactCarry.lane.test.ts`), and Systems' stored ladder, whose pose list moves at the
 * rig's own law speed (`strideOfRig`). Test support, never run in play.
 */
import { onCurveSteps } from '../economy/vehicleStats'

const RIG_SAFETY = { hull: 5000, cargo_hold: 5000 }

export interface SpeedRig {
  levels: Record<string, number>
  speedMps: number
}

export const SPEED_RIGS: Readonly<Record<string, SpeedRig>> = {
  '25 m/s': {
    levels: { drill_power: 250, drill_tip: 600, engine: 5000, ...RIG_SAFETY },
    speedMps: 25,
  },
  '44 m/s': { levels: { drill_power: 300, drill_tip: 200, ...RIG_SAFETY }, speedMps: 44 },
  '240 m/s': { levels: { drill_power: 450, drill_tip: 600, ...RIG_SAFETY }, speedMps: 240 },
  '3600 m/s': { levels: { drill_power: 2000, drill_tip: 600, ...RIG_SAFETY }, speedMps: 3600 },
}

const P200 = onCurveSteps(200)

export const LADDER_RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0, ...RIG_SAFETY },
  'stored 10': { drill_power: 10, drill_tip: 0, ...RIG_SAFETY },
  'stored 20': { drill_power: 20, drill_tip: 0, ...RIG_SAFETY },
  'stored 50': { drill_power: 50, drill_tip: 0, ...RIG_SAFETY },
  'stored 100': { drill_power: 100, drill_tip: 0, ...RIG_SAFETY },
  'stored 200': { drill_power: P200.drill_power, drill_tip: P200.drill_tip, ...RIG_SAFETY },
}
