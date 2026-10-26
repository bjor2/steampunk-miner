/**
 * The guard on offset starts (ticket 829, the GD amendment "planets don't necessarily start on
 * casing 1 requirement" and the GD re-lock): a planet row may set its surface grade q_surface above
 * the ladder's default, and the data validator refuses
 *
 * - a lead over `surfaceOffset.maxLead` (+1: no +2 for now), or a surface under the default;
 * - an offset on a solar system's first planet;
 * - a second offset planet in one solar system;
 * - a catch-up (every grade above the default up to q_surface, Systems' reading: the rig must own
 *   each) over `catchUpShareBp` (8%) of the median bot's money held after the fuel fee, or on a
 *   planet whose money held was never measured.
 *
 * Every problem is listed, none trimmed (design 18). Pure: the rows and the measurements come in.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { cmp, div, fromSafeInteger, mul, type Money } from '../money'
import { defaultCasingSurfaceGrade } from '../registries/planetRow'
import type { MeasuredMoneyHeld } from './casingLadderRules'
import { casingCatchUpPrice } from './casingPrices'
import { ECONOMY } from './economy'

/** A planet row's surface grade, as the validator reads it. */
export interface SurfaceGradeRow {
  planetIndex: number
  casingSurfaceGrade: bigint
}

const FIRST_PLANET = 1
const NO_LEAD = BigInt(0)

/** Every problem with the rows' offsets; empty when they all hold. */
export function casingSurfaceOffsetProblemsOf(
  rows: readonly SurfaceGradeRow[],
  measured: readonly MeasuredMoneyHeld[] = ECONOMY.casing.surfaceOffset.moneyHeldAfterFuel,
): string[] {
  const offsets = rows.filter((row) => leadOf(row) !== NO_LEAD)
  return [
    ...offsets.flatMap(leadProblems),
    ...offsets.flatMap(firstPlanetProblems),
    ...sharedSystemProblems(offsets),
    ...offsets.flatMap((row) => catchUpProblems(row, measured)),
  ]
}

/** The solar system a campaign index sits in: `planetsPerSystem` planets each (ticket 781). */
export function systemOfCampaignIndex(planetIndex: number): number {
  return Math.floor((planetIndex - FIRST_PLANET) / ECONOMY.starMap.planetsPerSystem) + 1
}

function leadOf(row: SurfaceGradeRow): bigint {
  return row.casingSurfaceGrade - defaultCasingSurfaceGrade(row.planetIndex)
}

function leadProblems(row: SurfaceGradeRow): string[] {
  const lead = leadOf(row)
  if (lead < NO_LEAD) return [`planet ${row.planetIndex} sets its surface grade under the default`]
  if (lead <= BigInt(ECONOMY.casing.surfaceOffset.maxLead)) return []
  return [`planet ${row.planetIndex} sets its surface grade +${lead} over the default`]
}

function firstPlanetProblems(row: SurfaceGradeRow): string[] {
  const isFirstOfSystem = (row.planetIndex - FIRST_PLANET) % ECONOMY.starMap.planetsPerSystem === 0
  return isFirstOfSystem
    ? [`planet ${row.planetIndex} is its system's first and takes no offset`]
    : []
}

function sharedSystemProblems(offsets: readonly SurfaceGradeRow[]): string[] {
  const systems = offsets.map((row) => systemOfCampaignIndex(row.planetIndex))
  return [...new Set(systems)]
    .filter((system) => systems.filter((other) => other === system).length > 1)
    .map((system) => `system ${system} has more than one offset planet`)
}

function catchUpProblems(row: SurfaceGradeRow, measured: readonly MeasuredMoneyHeld[]): string[] {
  const held = measured.find((entry) => entry.planet === row.planetIndex)
  if (held === undefined) return [`planet ${row.planetIndex} has no measured money held`]
  const catchUp = casingCatchUpPrice(
    defaultCasingSurfaceGrade(row.planetIndex),
    row.casingSurfaceGrade,
  )
  if (cmp(catchUp, catchUpCeilingOf(held.money)) <= 0) return []
  return [`planet ${row.planetIndex}'s catch-up costs more than the share of money held allows`]
}

function catchUpCeilingOf(money: Money): Money {
  const share = ECONOMY.casing.surfaceOffset.catchUpShareBp
  return mul(money, div(fromSafeInteger(share), fromSafeInteger(BASIS_POINTS)))
}
