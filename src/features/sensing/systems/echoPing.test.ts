import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  createScriptedSession,
  GROUND,
  PARAMS,
  WORLD_SEED,
} from '../../../systems/authority/scriptedSession'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { cellGateOf } from '../../mining-gates'
import { echoMarksOf, type EchoMark } from './echoPing'
import { tilesWithin } from './tileDisc'

// The echo sounder's ping (#162 Sensing row): caves, lava pockets and ore silhouettes inside its
// radius, never an ore's tier, and a gated ore cell's badge in place of its silhouette.

const MM = 1000
const RADIUS = 12
const CAVITY_TILE = { tx: GROUND.tx, ty: GROUND.ty - 20 }

function pingedCavity() {
  const session = createScriptedSession()
  const centre = { x: CAVITY_TILE.tx * MM + MM / 2, y: CAVITY_TILE.ty * MM + MM / 2 }
  session.submit(1, carveCircleCommand({ ...centre, radius: 2600, amount: SOLID_DENSITY }))
  return session.state()
}

const tileKey = ({ tx, ty }: TilePoint) => `${tx},${ty}`

describe('echo sounder ping', () => {
  it('marks the open cells of a cave inside its radius as cave', () => {
    const state = pingedCavity()
    const caves = echoMarksOf(state, CAVITY_TILE, RADIUS).filter((mark) => mark.kind === 'cave')
    expect(caves.map((mark) => mark.tile)).toContainEqual(CAVITY_TILE)
    const kinds = new Set(caves.map((mark) => kindOfCell(cellAt(state.world, PARAMS, mark.tile))))
    expect(kinds).toEqual(new Set([CELL_KIND.air]))
  })

  it('marks nothing outside its radius', () => {
    const inside = new Set(tilesWithin(CAVITY_TILE, RADIUS).map(tileKey))
    const marks = echoMarksOf(pingedCavity(), CAVITY_TILE, RADIUS)
    expect(marks.every((mark) => inside.has(tileKey(mark.tile)))).toBe(true)
  })

  it('shows every ore cell in reach as a silhouette or a gate badge and plain rock not at all', () => {
    const state = pingedCavity()
    const marks = new Map(echoMarksOf(state, CAVITY_TILE, RADIUS).map((m) => [tileKey(m.tile), m]))
    for (const tile of tilesWithin(CAVITY_TILE, RADIUS)) {
      const kind = kindOfCell(cellAt(state.world, PARAMS, tile))
      const mark = marks.get(tileKey(tile))
      if (kind === CELL_KIND.ore) expect(['ore', 'gate']).toContain(mark?.kind)
      if (kind === CELL_KIND.ground) expect(mark).toBeUndefined()
    }
  })

  it('carries no ore tier or id on any mark, only its kind and gate badge', () => {
    const marks = echoMarksOf(pingedCavity(), CAVITY_TILE, RADIUS)
    expect(new Set(marks.flatMap((mark) => Object.keys(mark)))).toEqual(
      new Set(['tile', 'kind', 'gate']),
    )
  })

  it('badges exactly the ore cells a gate holds on a gated planet, with that gate', () => {
    const { state, params } = heatPlanetEight()
    const marks = ringsDownColumnOf(params).flatMap((origin) => echoMarksOf(state, origin, RADIUS))
    const badges = new Set(marks.filter((mark) => mark.kind === 'gate').map((mark) => mark.gate))
    expect(badges).toEqual(new Set(['rig', 'dense', 'dynamite']))
    expect(marks.filter(isOreMark).every((mark) => mark.gate === gateAt(state, params, mark))).toBe(
      true,
    )
  })

  it('marks the lava pockets of a heat planet as lava', () => {
    const { state, params } = heatPlanetEight()
    const marks = ringsDownColumnOf(params).flatMap((origin) => echoMarksOf(state, origin, RADIUS))
    const lava = marks.filter((mark) => mark.kind === 'lava')
    expect(lava.length).toBeGreaterThan(0)
    const kinds = new Set(lava.map((mark) => kindOfCell(cellAt(state.world, params, mark.tile))))
    expect(kinds).toEqual(new Set([CELL_KIND.lava]))
  })

  it('changes nothing in the state it reads', () => {
    const state = pingedCavity()
    const world = state.world
    echoMarksOf(state, CAVITY_TILE, RADIUS)
    expect(state.world).toBe(world)
  })
})

/** Planet 8 of the first pacing seed: gate content (P7 on) and lava pockets (heat from P8). */
function heatPlanetEight() {
  const state = createAuthorityState({ planetIndex: 8, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  return { state, params: planetParamsOf(state.planet) as PlanetParams }
}

/** A ring every 20 tiles down column 0 from just under the surface to the core, through every band. */
function ringsDownColumnOf(params: PlanetParams): TilePoint[] {
  const rings: TilePoint[] = []
  const top = surfaceRowOfColumn(0, params.radiusTiles)
  for (let ty = top - 2; ty > params.coreRadiusTiles; ty -= 20) rings.push({ tx: 0, ty })
  return rings
}

function isOreMark(mark: EchoMark): boolean {
  return mark.kind === 'ore' || mark.kind === 'gate'
}

function gateAt(
  state: ReturnType<typeof createAuthorityState>,
  params: PlanetParams,
  mark: EchoMark,
) {
  const kind = cellGateOf(params, mark.tile, oreTypeAtTile(state, mark.tile)!).kind
  return kind === 'none' ? null : kind
}
