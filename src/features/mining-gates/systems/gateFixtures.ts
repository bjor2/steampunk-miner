/**
 * Spec fixtures for the gates: a session on a planet of the first pacing seed with the tip at a
 * chosen major, and an ore cell of a chosen gate-table entry at a tile of its band. The cell need
 * not be in the generated world: `canMine` reads the tile only for its band and the cell for its
 * ore, so a fixture names any entry without searching the ground for one.
 */
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  continueScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { PACING_WORLD_SEEDS } from '../../../constants/pacingSeeds'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import type { BlastEvent } from '../../../systems/registries/blastEffects'
import type { GateQuery } from '../../../systems/registries/gateChecks'
import { oreTypeOf, type OreType } from '../../../systems/registries/oreTypes'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { oreCell, type ResourceFamily } from '../../../systems/world/worldCell'
import { oreFamilies } from '../../ores'
import { gateTableOfPlanet } from './cellGates'
import type { CellGate, GatedEntry } from './gateTable'

export const FIXTURE_SEED = PACING_WORLD_SEEDS['bot-slice'][0]

export interface GatedCellFixture {
  tile: TilePoint
  cell: number
  ore: OreType
  gate: CellGate
  entry: GatedEntry['entry']
  band: number
}

export function sessionOn(planetIndex: number): ScriptedSession {
  return continueScriptedSession(
    createAuthorityState({ planetIndex, planetSeed: FIXTURE_SEED, playerIds: ['p1'] }),
  )
}

export function paramsOn(session: ScriptedSession): PlanetParams {
  return planetParamsOf(session.state().planet) as PlanetParams
}

/** The drill tip at `major`, plus `pips` pips toward the next. */
export function setTipMajor(session: ScriptedSession, major: number, pips = 0): void {
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_tip', level: stepOfMajor(major) + pips },
  })
}

export function grantItems(session: ScriptedSession, owned: string[]): void {
  session.submit(0, { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned } })
}

export function setCharges(session: ScriptedSession, size: number): void {
  session.submit(0, { type: 'debug.setCharges', payload: { size, carried: 1, slotLevel: 0 } })
}

/** The first entry of the planet's table `pick` names, as a cell at a tile of its band. */
export function gatedCellOn(
  params: PlanetParams,
  pick: (gated: GatedEntry, band: number) => boolean,
): GatedCellFixture {
  const bands = gateTableOfPlanet(params).bands
  for (let at = 0; at < bands.length; at++) {
    const gated = bands[at].find((one) => pick(one, at + 1))
    if (gated !== undefined) return fixtureOf(params, gated, at + 1)
  }
  throw new Error(`planet ${params.planetIndex} has no gate-table entry the fixture asks for`)
}

/** The drill asking; a blast of `size` asking; or a tool. */
export function queryOf(
  session: ScriptedSession,
  fixture: GatedCellFixture,
  means: { blastSize?: number; tool?: string } = {},
): GateQuery {
  const { tile, cell, ore } = fixture
  return {
    state: session.state(),
    playerId: 'p1',
    tile,
    cell,
    ore,
    blast: means.blastSize === undefined ? null : blastOf(tile, means.blastSize),
    ...(means.tool === undefined ? {} : { tool: means.tool }),
  }
}

function fixtureOf(params: PlanetParams, gated: GatedEntry, band: number): GatedCellFixture {
  const { entry, gate } = gated
  const cell = oreCell(cellCodeOf(entry.family), entry.tier - oreTier(params.planetIndex, 1))
  const tile = tileInBand(params, band)
  return {
    tile,
    cell,
    ore: oreTypeOf({ tier: entry.tier, cellFamily: cellCodeOf(entry.family) }),
    gate,
    entry,
    band,
  }
}

function cellCodeOf(family: string): ResourceFamily {
  const row = oreFamilies().find((candidate) => candidate.id === family)
  if (row === undefined) throw new Error(`no ore family ${family}`)
  return row.cellCode as ResourceFamily
}

/** The first tile of band `band` straight down column 0 from the surface. */
function tileInBand(params: PlanetParams, band: number): TilePoint {
  const surface = surfaceRowOfColumn(0, params.radiusTiles)
  for (let ty = surface; ty > -surface; ty--) {
    if (bandOfTile(params, 0, ty) === band) return { tx: 0, ty }
  }
  throw new Error(`no tile of band ${band} under column 0`)
}

function blastOf(tile: TilePoint, size: number): BlastEvent {
  return { ...tile, radiusMm: 0, size, playerId: 'p1', source: 'charge', tick: 0 }
}
