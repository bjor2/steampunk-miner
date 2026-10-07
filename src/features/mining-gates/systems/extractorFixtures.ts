/**
 * Spec fixtures for the extractor verbs (ticket 237): a session on a planet of the first pacing
 * seed with enemies frozen, the drill on curve there, an extractor granted, and the vehicle on the
 * tile west of the first generated cell that extractor opens, facing it.
 */
import { poseOnTile } from '../../../systems/authority/charges/chargeFixtures'
import { FREEZE_ENEMIES, type ScriptedSession } from '../../../systems/authority/scriptedSession'
import { onCurveSteps } from '../../../systems/economy/vehicleStats'
import type { OreType } from '../../../systems/registries/oreTypes'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { grantItems, paramsOn, sessionOn, worldCellOfGate } from './gateFixtures'

export interface ExtractorSite {
  session: ScriptedSession
  params: PlanetParams
  /** The extractor-gated cell. */
  tile: TilePoint
  ore: OreType
  /** Where the vehicle stands: the tile west of the cell. */
  stand: TilePoint
}

/** `owned` lists the extractors granted: the cell's own unless named. */
export function extractorSiteOn(planetIndex: number, rigId: string, owned = [rigId]) {
  const session = sessionOn(planetIndex)
  const params = paramsOn(session)
  const cell = worldCellOfGate(params, (gate) => gate.kind === 'rig' && gate.rig.id === rigId)
  const stand = { tx: cell.tile.tx - 1, ty: cell.tile.ty }
  session.submit(0, FREEZE_ENEMIES)
  setDrillOnCurve(session, planetIndex)
  grantItems(session, owned)
  session.submit(0, poseOnTile(stand))
  return { session, params, tile: cell.tile, ore: cell.ore, stand } satisfies ExtractorSite
}

/** The drill pressed on the cell for one tick: enough for a gate to answer. */
export function touch(session: ScriptedSession, tile: TilePoint, tick: number) {
  return session.submit(tick, { type: 'drillTile', payload: { ...tile, ticks: 1 } })
}

/** The drill on the cell for `ticks`, ending at `tick`. */
export function drillFor(session: ScriptedSession, tile: TilePoint, tick: number, ticks: number) {
  session.advanceTo(tick)
  return session.submit(tick, { type: 'drillTile', payload: { ...tile, ticks } })
}

/** Enough drilling to break any cell an on-curve drill cuts (#6: at most 60 ticks a tile). */
export const BREAK_TICKS = 120

function setDrillOnCurve(session: ScriptedSession, planetIndex: number): void {
  const steps = onCurveSteps(planetIndex)
  for (const upgradeId of ['drill_power', 'drill_tip'] as const) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level: steps[upgradeId] } })
  }
}
