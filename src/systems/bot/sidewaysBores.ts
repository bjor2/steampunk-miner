/**
 * The bot's sideways bores (Bjor's ruling on #723): a sideways cut moves at `min(vCut, speedMax)`,
 * so a gallery tile the drill would cut faster than the drive drives takes the drive's time over
 * it on the scripted clock. Each planet keeps its level-leg bore ticks and the share of them the
 * drive held, which `balance:report` prints per planet (`logging/driveBoundReport.ts`): over half
 * from planet 3 on fails the ticket's bar.
 */
import { isDriveCappedFacing } from '../vehicle/cutAxisCaps'
import { sidewaysSubStepsOf } from '../vehicle/cutCapSpeed'
import type { Facing } from '../vehicle/vehiclePose'
import type { TileBore } from './boreClock'

/** One planet's sideways bores, in ticks of the scripted clock. */
export interface SidewaysBorePlanet {
  planet: number
  boreTicks: number
  /** Ticks of the bores whose time the drive, not the drill, set. */
  driveBoundTicks: number
}

/** Every planet's sideways bores in one run, by planet index. */
export type SidewaysBoreTally = Map<number, SidewaysBorePlanet>

export function newSidewaysBoreTally(): SidewaysBoreTally {
  return new Map()
}

/** A bore along `facing`: sideways, at least the drive's time over the tile; else the drill's. */
export function drivenBoreOf(bore: TileBore, facing: Facing, speedMax: number): TileBore {
  if (!isDriveCappedFacing(facing)) return bore
  return { ...bore, subSteps: sidewaysSubStepsOf(bore.subSteps, speedMax, bore.quantum) }
}

/** Counts a sideways bore on `planet`: the drill's own time and the time the drive gave it. */
export function tallySidewaysBore(
  tally: SidewaysBoreTally,
  planet: number,
  drillBore: TileBore,
  drivenBore: TileBore,
): void {
  const record = planetRecordOf(tally, planet)
  const ticks = drivenBore.subSteps / drivenBore.quantum
  record.boreTicks += ticks
  if (drivenBore.subSteps > drillBore.subSteps) record.driveBoundTicks += ticks
}

/** The share of the planet's sideways bore ticks the drive held, 0 to 1; 0 with none. */
export function driveBoundShareOf(record: SidewaysBorePlanet): number {
  return record.boreTicks === 0 ? 0 : record.driveBoundTicks / record.boreTicks
}

function planetRecordOf(tally: SidewaysBoreTally, planet: number): SidewaysBorePlanet {
  const known = tally.get(planet)
  if (known !== undefined) return known
  const fresh = { planet, boreTicks: 0, driveBoundTicks: 0 }
  tally.set(planet, fresh)
  return fresh
}
