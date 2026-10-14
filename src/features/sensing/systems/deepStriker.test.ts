import { describe, expect, it } from 'vitest'
import { setArtefactCommand } from '../../../systems/artefacts/artefactCommands'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { GROUND, type ScriptedSession } from '../../../systems/authority/scriptedSession'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { MM, press, sensingSession, standInPocket } from '../sensingTestSession'
import { CONE_HALF_TAN_PER_MILLE, echoConeTilesOf } from './deepStriker'
import { boardAfterUses, EMPTY_REVEAL_BOARD } from './revealBoard'
import { tilesWithin } from './tileDisc'

// The Deep Striker twist on the echo sounder (spec #162, ticket 329): held, the ping is a cone
// down into the band below that spends the ring's cell budget; not held, the ping is the ring.

const ECHO = { 'powerup.1': 'power.echo_sounder' }
const DEEP_STRIKER = 'artefact.seismic_ping'
const UNDERGROUND = { tx: GROUND.tx, ty: GROUND.ty - 20 }
/** Below the ring's 12 tiles, inside the cone's 29 and the board's nearest-first cap. */
const DEEP_POCKET = { tx: UNDERGROUND.tx, ty: UNDERGROUND.ty - 14 }
const STRAIGHT_DOWN = { x: 0, y: -1024 }
const RADIUS = 12

/** The local board after one echo ping from the pocket, the twist held when `isTwisted`. */
function boardAfterPing(isTwisted: boolean) {
  const session = sensingSession(ECHO)
  if (isTwisted) session.submit(1, setArtefactCommand(DEEP_STRIKER))
  carvePocketAt(session, DEEP_POCKET)
  standInPocket(session, 2, UNDERGROUND)
  const events = pressAndAct(session)
  return boardAfterUses(EMPTY_REVEAL_BOARD, events, session.state(), 'p1')
}

function carvePocketAt(session: ScriptedSession, tile: TilePoint): void {
  const centre = { x: tile.tx * MM + MM / 2, y: tile.ty * MM + MM / 2 }
  session.submit(1, carveCircleCommand({ ...centre, radius: 1500, amount: SOLID_DENSITY }))
}

function pressAndAct(session: ScriptedSession): DomainEvent[] {
  const from = session.events().length
  session.submit(10, press('powerup.1'))
  session.advanceTo(16)
  return session.events().slice(from)
}

const isAt = (tile: TilePoint, at: TilePoint) => tile.tx === at.tx && tile.ty === at.ty

describe('Deep Striker cone', () => {
  it('spends about the ring’s cell budget, within 5%', () => {
    const cone = echoConeTilesOf({ tx: 0, ty: 0 }, STRAIGHT_DOWN, RADIUS).length
    const ring = tilesWithin({ tx: 0, ty: 0 }, RADIUS).length
    expect(Math.abs(cone - ring) * 100).toBeLessThanOrEqual(5 * ring)
  })

  it('reaches √6 times the radius straight down and keeps within 30° of the axis', () => {
    const tiles = echoConeTilesOf({ tx: 0, ty: 0 }, STRAIGHT_DOWN, RADIUS)
    expect(Math.min(...tiles.map((tile) => tile.ty))).toBe(-29)
    expect(tiles.every((tile) => tile.ty < 0)).toBe(true)
    expect(
      tiles.every((tile) => Math.abs(tile.tx) * 1000 <= CONE_HALF_TAN_PER_MILLE * -tile.ty),
    ).toBe(true)
  })

  it('marks a cave below the ring’s reach when the twist is held, and nothing above the miner', () => {
    const marks = boardAfterPing(true).marks
    expect(marks.some((mark) => isAt(mark.tile, DEEP_POCKET))).toBe(true)
    expect(marks.filter((mark) => mark.tile.ty > UNDERGROUND.ty)).toEqual([])
  })

  it('pings the ring round the miner while the twist is not held', () => {
    const marks = boardAfterPing(false).marks
    expect(marks.some((mark) => isAt(mark.tile, DEEP_POCKET))).toBe(false)
    expect(marks.some((mark) => isAt(mark.tile, UNDERGROUND))).toBe(true)
  })
})
