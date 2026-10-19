/**
 * The rigs the slab lanes cut with (ticket 535's reference rows, VS 6230602042; ticket 540's swept
 * rows, Systems 6231144515): VS's rigs named by their band-1 cut speed, as the loop lane names them
 * (`physics/exactCarry.lane.test.ts`), and Systems' stored ladder, whose pose list moves at the
 * rig's own law speed (`strideOfRig`). Test support, never run in play.
 *
 * Since the GD ruling on #551 (ticket 552) a stored drill step is one purchase of x1.243: a speed
 * rig holds the first purchase whose band-1 law speed reaches its name (D(14) = 25.5, D(17) = 49,
 * D(20) = 94, D(24) = 225, D(25) = 279 cells/s; 106 is far past the one-sub-step floor, as 2000
 * was), and the 84 and 200 m/s rigs carry #551's tank bars. The stored ladder's names are
 * purchases now, #551's charge rows at L1, 10, 20 and 50: from 50 on a cell costs under one
 * sub-step, so a slab holds under 100 quanta and its row is logged, not gated.
 */
import { onCurveSteps } from '../economy/vehicleStats'

/**
 * A hull and hold no slab breaks or fills: hold purchase 56 carries 2,080 units, the old step
 * 5000's 2,010 (ticket 553); engine purchase 17 below (13.75 m/s) is the old top engine's 13.6.
 */
const RIG_SAFETY = { hull: 5000, cargo_hold: 56 }

export interface SpeedRig {
  levels: Record<string, number>
  speedMps: number
}

export const SPEED_RIGS: Readonly<Record<string, SpeedRig>> = {
  '25 m/s': {
    levels: { drill_power: 14, drill_tip: 600, engine: 17, ...RIG_SAFETY },
    speedMps: 25,
  },
  '44 m/s': { levels: { drill_power: 17, drill_tip: 200, ...RIG_SAFETY }, speedMps: 44 },
  '84 m/s': { levels: { drill_power: 20, drill_tip: 600, ...RIG_SAFETY }, speedMps: 84 },
  '200 m/s': { levels: { drill_power: 24, drill_tip: 600, ...RIG_SAFETY }, speedMps: 200 },
  '240 m/s': { levels: { drill_power: 25, drill_tip: 600, ...RIG_SAFETY }, speedMps: 240 },
  '3600 m/s': { levels: { drill_power: 106, drill_tip: 600, ...RIG_SAFETY }, speedMps: 3600 },
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
