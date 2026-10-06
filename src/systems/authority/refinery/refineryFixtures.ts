/**
 * Places refinery specs play at (#105): a scripted session moved to a planet with `debug.*`
 * commands, poses at rest in any of that planet's bays, and band-1 ore mined off its surface so
 * the hold has something to refine. Pure, like `scriptedSession.ts`.
 */
import { setPlanetCommand, setPlanetSeedCommand } from '../../startScenarioCommands'
import { bayPoseAt, FACING } from '../../vehicle/vehiclePose'
import type { BayId } from '../../world/dockBays'
import { dockSiteOf, type DockSite } from '../../world/dockSite'
import { planetParamsFor, type PlanetParams } from '../../world/planetParams'
import type { DomainEvent } from '../domainEvent'
import { vehicleOf } from '../authorityState'
import {
  createScriptedSession,
  mineTile,
  poseAbove,
  surfaceOreTiles,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'

export const REFINERY_PLANET = 3
export const REFINERY_PARAMS = planetParamsFor(WORLD_SEED, REFINERY_PLANET)
export const REFINERY_SITE = dockSiteOf(REFINERY_PARAMS)

/** Ticks between two mined tiles: `mineTile` drills for 40 ticks after its pose. */
const TICKS_PER_MINED_TILE = 50

/** A session on `planetIndex` (the world seed's planet), with `money` in the wallet. */
export function sessionOnPlanet(planetIndex: number, money = '0'): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setPlanetCommand(planetIndex))
  session.submit(0, setPlanetSeedCommand(WORLD_SEED))
  session.submit(0, { type: 'debug.setMoney', payload: { amount: money } })
  return session
}

/** At rest in one bay's pad zone of `site`, as a pose report. */
export function poseInBayOf(site: DockSite, bay: BayId) {
  const { payload } = poseAbove(site.dockPoint, FACING.right)
  return { type: 'reportPose' as const, payload: { ...payload, ...bayPoseAt(site, bay) } }
}

/** Undocks if docked, drives onto a bay's pad of `site` and docks there, all at one tick. */
export function dockAtBayOf(
  session: ScriptedSession,
  tick: number,
  site: DockSite,
  bay: BayId,
): DomainEvent[] {
  if (vehicleOf(session.state(), 'p1').mode === 'docked') {
    session.submit(tick, { type: 'undock', payload: {} })
  }
  session.submit(tick, poseInBayOf(site, bay))
  return session.submit(tick, { type: 'dock', payload: { bay } })
}

/** Mines `count` band-1 ore tiles of `params` from `startTick`; returns the tick after the last. */
export function mineSurfaceOre(
  session: ScriptedSession,
  startTick: number,
  count: number,
  params: PlanetParams = REFINERY_PARAMS,
): number {
  surfaceOreTiles(count, params).forEach((tile, index) =>
    mineTile(session, startTick + TICKS_PER_MINED_TILE * index, tile),
  )
  return startTick + TICKS_PER_MINED_TILE * count
}
