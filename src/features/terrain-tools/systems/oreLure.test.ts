import { describe, expect, it } from 'vitest'
import { setArtefactCommand } from '../../../systems/artefacts/artefactCommands'
import { dockInBay, type ScriptedSession } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { chargesLeftOf } from '../../power-up-core'
import {
  buriedTile,
  ofType,
  oreAround,
  press,
  sessionWithRoomyHold,
  standAt,
} from '../terrainTestSession'
import { ORE_SHIFTER_ID } from './oreShifter'
import { terrainToolsOf } from './terrainSection'

// The Ore Lure twist on the ore-shifter (spec #162 twist row, ticket 329): held, a use near no
// plate leaves one on the tunnel wall at the miner's tile; a use farther than the shifter's reach
// from it drags the ore round the hull toward the plate instead of the hull, with the same count,
// cap and fixed cells. The owner's dock takes the plate back. The hold is large enough that the
// movers' trip cap never binds (ticket 408).

const SHIFTER = { 'powerup.1': ORE_SHIFTER_ID }
const ORE_LURE = 'artefact.salvage_magnet'
const REACH = 6
/** The shifter's 600-tick cooldown, then the next press. */
const NEXT_PRESS = 10 + 600 + 6
/** The 6-tick wind-up, then the queue's two ticks for a corner edit. */
const SETTLED = 20
const PLATE_TILE = buriedTile(8)
/** Fifteen columns over: beyond the shifter's reach of the plate. */
const FAR_TILE = buriedTile(8, PLATE_TILE.tx + 15)

function distanceSq(a: TilePoint, b: TilePoint): number {
  return (a.tx - b.tx) ** 2 + (a.ty - b.ty) ** 2
}

/** A miner holding `artefactId`, standing at the plate's tile and pressing the shifter once. */
function sessionAfterFirstPress(artefactId = ORE_LURE): ScriptedSession {
  const session = sessionWithRoomyHold(SHIFTER)
  session.submit(2, setArtefactCommand(artefactId))
  standAt(session, 5, PLATE_TILE, FACING.right)
  session.submit(10, press())
  session.advanceTo(10 + SETTLED)
  return session
}

/** The second press, from `tile`, after the cooldown; the ore round it before and after. */
function pressAgainFrom(session: ScriptedSession, tile: TilePoint) {
  standAt(session, NEXT_PRESS - 1, tile, FACING.right)
  const before = oreAround(session.state(), tile, REACH + 1)
  const from = session.events().length
  session.submit(NEXT_PRESS, press())
  session.advanceTo(NEXT_PRESS + SETTLED)
  const events = session.events().slice(from)
  return { before, after: oreAround(session.state(), tile, REACH + 1), events }
}

const pullToward = (ore: readonly { tile: TilePoint }[], to: TilePoint) =>
  ore.reduce((sum, { tile }) => sum + distanceSq(tile, to), 0)

describe('Ore Lure', () => {
  it('leaves the plate at the miner’s tile with the first use, for a charge, changing no cell', () => {
    const session = sessionAfterFirstPress()
    expect(terrainToolsOf(session.state(), 'p1').plate).toEqual({ ...PLATE_TILE, planetIndex: 1 })
    expect(ofType(session.events(), 'terrain-tools.TerrainEdited')).toEqual([])
    expect(chargesLeftOf(session.state(), 'p1', ORE_SHIFTER_ID)).toBe(1)
  })

  it('drags the ore round the hull toward the plate from beyond its reach', () => {
    const session = sessionAfterFirstPress()
    const { before, after, events } = pressAgainFrom(session, FAR_TILE)
    expect(ofType(events, 'terrain-tools.TerrainEdited')).toHaveLength(1)
    // A drag to the hull keeps its nodules round the hull; a lure takes some off toward the plate.
    expect(after.length).toBeLessThan(before.length)
    expect(pullToward(after, PLATE_TILE)).toBeLessThan(pullToward(before, PLATE_TILE))
    expect(terrainToolsOf(session.state(), 'p1').plate).toEqual({ ...PLATE_TILE, planetIndex: 1 })
  })

  it('moves the one plate when used within the shifter’s reach of it', () => {
    const session = sessionAfterFirstPress()
    const near = { tx: PLATE_TILE.tx + 3, ty: PLATE_TILE.ty }
    const { events } = pressAgainFrom(session, near)
    expect(ofType(events, 'terrain-tools.TerrainEdited')).toEqual([])
    expect(terrainToolsOf(session.state(), 'p1').plate).toEqual({ ...near, planetIndex: 1 })
  })

  it('is taken back at the owner’s dock, leaving the section as if never used', () => {
    const session = sessionAfterFirstPress()
    dockInBay(session, 40, 'sell')
    expect(terrainToolsOf(session.state(), 'p1').plate).toBeUndefined()
    expect(session.state().players.p1.slices?.['terrain-tools']).toBeUndefined()
  })

  it('drags toward the hull as before, leaving no plate, while a base artefact is held', () => {
    const session = sessionAfterFirstPress('artefact.ore_whisper')
    expect(ofType(session.events(), 'terrain-tools.TerrainEdited')).toHaveLength(1)
    expect(terrainToolsOf(session.state(), 'p1').plate).toBeUndefined()
  })
})
