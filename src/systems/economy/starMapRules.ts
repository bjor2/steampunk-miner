/**
 * The star map's rules (tickets 754 to 756 and 781), the `starMap` block of economy.json: the GD
 * lock on #650 (comment 6361556890, TD architecture), the VS input (6361573401) and the Systems
 * ruling on #756 that reconciled them. A planet is addressed by its solar system `s` and its place
 * `p` in it; the economy reads the campaign index `g = campaignIndex(s, p)`
 * (`starMap/campaignIndex.ts`), which counts every planet of the systems before `s` (the TD ruling
 * on ticket 781: g is gap-free), so system 1 is today's planet line.
 *
 * `planetsPerSystem` is the per-system planet count; every system holds the same count today, so
 * the planets before system `s` are `(s - 1) * planetsPerSystem`. It is not J: J is the jump fuel
 * multiplier between systems (ticket 759). System 1 never reads it, so P1 onward stay
 * byte-identical whatever it holds.
 *
 * `fuel` is the Systems ruling's fuel curve and tank (ticket 756, `economy/jumpFuel.ts` and
 * `economy/fuelTank.ts`):
 *   fuelUnits(a -> b) = baseUnits * (1 + distanceStep * |g_b - g_a|)      U0 = 4, so 5 to the next planet
 *   unitPrice(g)      = unitPriceShare * R(g - 1)                          kappa = 0.1
 *   Fee(a -> b)       = fuelUnits * unitPrice(g_b), so Fee(p -> p+1) = 0.5 * R(p)
 *   tank capacity(n)  = capacityAtLevel1 * capacityRatio^(n-1)             C0 = 10: a hop and the trip back
 *   tank price(n)     = priceAtLevel1 * priceRatio^(n-1)                   the GD lock's C0 * 1.3^(n-1)
 * R is the median run sell value. Until the Tester's paired P1-P5 run measures it, `runValue`
 * stands it in as `oreUnits` ore units of the planet's top band, so the curve keeps the VS ratio
 * V(t_top(g)) / V(t_top(1)). `runValue` and `tank.priceAtLevel1` are provisional (ticket 756): that
 * run's numbers retune them, never the shape.
 *
 * `systemJump` is the jump between solar systems (ticket 759): the same law with J, the jump fuel
 * multiplier (GD lock on #650, VS input 6361573401: "g advancing by data J"), the system jump's
 * hardness step k_jump (the Producer's GD lock on #759: 1.10, about 0.91x felt speed on paper),
 * and the jump drive's price as run values R of a system's last planet:
 *   fuelUnits(a -> b) = baseUnits * (1 + distanceStep * |g_b - g_a|) * fuelMultiplier   between systems
 *   rock hardness     = H * hardnessStep^(s - 1)                                         in system s
 *   jump drive        = driveRunValues * R(planetsPerSystem)
 * J and the drive's price are provisional (ticket 759): no decision gives them, and the Tester's
 * bot run of the jump judges them. k_jump is the GD's; if the felt speed misses, only it moves.
 */
import { add, cmp, fromSafeInteger, mul, type BigStat, type Money } from '../money'
import type { FieldReader } from './economyFieldReader'

export interface StarMapRules {
  /** The planets each solar system holds; the campaign index counts them system by system. */
  planetsPerSystem: number
  fuel: JumpFuelRules
  systemJump: SystemJumpRules
}

export interface SystemJumpRules {
  /** J: what a jump between systems burns over the same distance inside one. */
  fuelMultiplier: BigStat
  /** k_jump: how much harder each system's rock is than the system before at the same g. */
  hardnessStep: BigStat
  /** The jump drive's price in run values R of a system's last planet. */
  driveRunValues: Money
}

export interface JumpFuelRules {
  /** U0: the fuel units of a jump before its distance factor. */
  baseUnits: BigStat
  /** What each planet between a jump's start and end adds to its distance factor. */
  distanceStep: BigStat
  /** kappa: one fuel unit's price as a share of the run value R of the planet before. */
  unitPriceShare: Money
  runValue: RunValueStandIn
  tank: FuelTankRules
}

/** R(p), the median run sell value, stood in until it is measured (provisional). */
export interface RunValueStandIn {
  oreUnits: BigStat
  band: number
}

export interface FuelTankRules {
  capacityAtLevel1: BigStat
  capacityRatio: BigStat
  priceAtLevel1: Money
  priceRatio: Money
}

const PATH = 'starMap'

export function readStarMap(reader: FieldReader, value: unknown): StarMapRules {
  const starMap = reader.object(PATH, value)
  const read = {
    planetsPerSystem: reader.safeInteger(`${PATH}.planetsPerSystem`, starMap.planetsPerSystem),
    fuel: readJumpFuel(reader, starMap.fuel),
    systemJump: readSystemJump(reader, starMap.systemJump),
  }
  if (read.planetsPerSystem < 1) reader.record(`${PATH}.planetsPerSystem must be 1 or more`)
  return read
}

function readJumpFuel(reader: FieldReader, value: unknown): JumpFuelRules {
  const path = `${PATH}.fuel`
  const fuel = reader.object(path, value)
  const read = {
    baseUnits: reader.money(`${path}.baseUnits`, fuel.baseUnits),
    distanceStep: reader.money(`${path}.distanceStep`, fuel.distanceStep),
    unitPriceShare: reader.money(`${path}.unitPriceShare`, fuel.unitPriceShare),
    runValue: readRunValue(reader, `${path}.runValue`, fuel.runValue),
    tank: readFuelTank(reader, `${path}.tank`, fuel.tank),
  }
  recordUnless(reader, isAtLeast(read.baseUnits, 1), `${path}.baseUnits must be 1 or more`)
  recordUnless(reader, isAbove(read.distanceStep, 0), `${path}.distanceStep must be above 0`)
  recordUnless(reader, isAbove(read.unitPriceShare, 0), `${path}.unitPriceShare must be above 0`)
  recordUnless(
    reader,
    holdsHopAndReturn(read),
    `${path}.tank.capacityAtLevel1 must hold the next hop and the trip back`,
  )
  return read
}

function readSystemJump(reader: FieldReader, value: unknown): SystemJumpRules {
  const path = `${PATH}.systemJump`
  const jump = reader.object(path, value)
  const read = {
    fuelMultiplier: reader.money(`${path}.fuelMultiplier`, jump.fuelMultiplier),
    hardnessStep: reader.money(`${path}.hardnessStep`, jump.hardnessStep),
    driveRunValues: reader.money(`${path}.driveRunValues`, jump.driveRunValues),
  }
  recordUnless(
    reader,
    isAtLeast(read.fuelMultiplier, 1),
    `${path}.fuelMultiplier must be 1 or more`,
  )
  recordUnless(reader, isAtLeast(read.hardnessStep, 1), `${path}.hardnessStep must be 1 or more`)
  recordUnless(reader, isAbove(read.driveRunValues, 0), `${path}.driveRunValues must be above 0`)
  return read
}

function readRunValue(reader: FieldReader, path: string, value: unknown): RunValueStandIn {
  const runValue = reader.object(path, value)
  const read = {
    oreUnits: reader.money(`${path}.oreUnits`, runValue.oreUnits),
    band: reader.safeInteger(`${path}.band`, runValue.band),
  }
  recordUnless(reader, isAbove(read.oreUnits, 0), `${path}.oreUnits must be above 0`)
  recordUnless(reader, read.band >= 1, `${path}.band must be 1 or more`)
  return read
}

function readFuelTank(reader: FieldReader, path: string, value: unknown): FuelTankRules {
  const tank = reader.object(path, value)
  const read = {
    capacityAtLevel1: reader.money(`${path}.capacityAtLevel1`, tank.capacityAtLevel1),
    capacityRatio: reader.money(`${path}.capacityRatio`, tank.capacityRatio),
    priceAtLevel1: reader.money(`${path}.priceAtLevel1`, tank.priceAtLevel1),
    priceRatio: reader.money(`${path}.priceRatio`, tank.priceRatio),
  }
  recordUnless(reader, isAbove(read.capacityRatio, 1), `${path}.capacityRatio must be above 1`)
  recordUnless(reader, isAbove(read.priceAtLevel1, 0), `${path}.priceAtLevel1 must be above 0`)
  recordUnless(reader, isAtLeast(read.priceRatio, 1), `${path}.priceRatio must be 1 or more`)
  return read
}

/** The first tank carries the next hop and the trip back (Systems ruling on #756): 2 * U0 * (1 + step). */
function holdsHopAndReturn(fuel: Omit<JumpFuelRules, 'runValue'>): boolean {
  const hop = mul(fuel.baseUnits, add(fromSafeInteger(1), fuel.distanceStep))
  return cmp(fuel.tank.capacityAtLevel1, add(hop, hop)) >= 0
}

function recordUnless(reader: FieldReader, holds: boolean, problem: string): void {
  if (!holds) reader.record(problem)
}

function isAbove(amount: Money, floor: number): boolean {
  return cmp(amount, fromSafeInteger(floor)) > 0
}

function isAtLeast(amount: Money, floor: number): boolean {
  return cmp(amount, fromSafeInteger(floor)) >= 0
}
