import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { GROUND, type ScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { MM, press, sensingSession, standInPocket } from '../sensingTestSession'
import { BUOY_PIN_CAP, REVEAL_MARK_CAP } from './revealBudget'
import {
  boardAfterDock,
  boardAfterUses,
  boardAt,
  EMPTY_REVEAL_BOARD,
  type RevealBoard,
} from './revealBoard'

// The client reveal board (#203, TD lock on Q1): the local player's echo pings and flare maps,
// every buoy pin in the world and the rings they re-ping, derived from `PowerUpUsed` and pure
// reads, capped nearest-first with the soonest-to-expire marks evicted first.

const UNDERGROUND = { tx: GROUND.tx, ty: GROUND.ty - 20 }
const ECHO = { 'powerup.1': 'power.echo_sounder' }
const FLARE = { 'powerup.1': 'consumable.flare_mortar' }
const BUOY = { 'powerup.1': 'consumable.signal_buoy' }
/** Pressed on tick 10, a use acts after its 6-tick wind-up. */
const PRESS_TICK = 10
const ACT_TICK = 16
/** A bought echo's reveal (#162 4.2). */
const ECHO_REVEAL_TICKS = 600

/** Presses slot 1 for `playerId` and returns the batch the use acts in. */
function pressSlotOne(session: ScriptedSession, playerId = 'p1'): DomainEvent[] {
  const from = session.events().length
  session.submit(PRESS_TICK, press('powerup.1'), playerId)
  session.advanceTo(ACT_TICK)
  return session.events().slice(from)
}

function boardAfterUse(slots: Readonly<Record<string, string>>, local = 'p1') {
  const session = sensingSession(slots, ['p1', 'p2'])
  standInPocket(session, 2, UNDERGROUND)
  const events = pressSlotOne(session)
  return { session, board: boardAfterUses(EMPTY_REVEAL_BOARD, events, session.state(), local) }
}

const tilesOf = (board: RevealBoard) => board.marks.map((mark) => `${mark.tile.tx},${mark.tile.ty}`)

const distanceSq = (a: TilePoint, b: TilePoint) => (a.tx - b.tx) ** 2 + (a.ty - b.ty) ** 2

describe('sensing reveal board', () => {
  it('marks the open cells round the miner when the local player pings', () => {
    const { board } = boardAfterUse(ECHO)
    expect(board.marks.length).toBeGreaterThan(0)
    expect(board.marks.every((mark) => mark.kind === 'cave' || mark.kind === 'ore')).toBe(true)
    expect(tilesOf(board)).toContain(`${UNDERGROUND.tx},${UNDERGROUND.ty}`)
  })

  it('keeps the ping for a bought echo’s 600 ticks, then lets it go', () => {
    const { session, board } = boardAfterUse(ECHO)
    const state = session.state()
    expect(boardAt(board, state, ACT_TICK + ECHO_REVEAL_TICKS - 1).marks).toHaveLength(
      board.marks.length,
    )
    expect(boardAt(board, state, ACT_TICK + ECHO_REVEAL_TICKS).marks).toEqual([])
  })

  it('shows another player nothing of a ping that is not theirs', () => {
    expect(boardAfterUse(ECHO, 'p2').board).toEqual(EMPTY_REVEAL_BOARD)
  })

  it('keeps the nearest cells of a 12-tile echo in a cave wider than its cap', () => {
    const session = sensingSession(ECHO)
    const centre = { x: UNDERGROUND.tx * MM + MM / 2, y: UNDERGROUND.ty * MM + MM / 2 }
    session.submit(1, carveCircleCommand({ ...centre, radius: 12_500, amount: SOLID_DENSITY }))
    standInPocket(session, 2, UNDERGROUND)
    const board = boardAfterUses(EMPTY_REVEAL_BOARD, pressSlotOne(session), session.state(), 'p1')
    expect(board.marks).toHaveLength(REVEAL_MARK_CAP)
    const farthestKept = Math.max(...board.marks.map((mark) => distanceSq(mark.tile, UNDERGROUND)))
    expect(farthestKept).toBeLessThan(12 * 12)
  })

  it('lands a flare 30 tiles along the facing and maps its 6-tile ring until the dock', () => {
    const session = sensingSession(FLARE)
    const landing = { tx: UNDERGROUND.tx + 30, ty: UNDERGROUND.ty }
    const centre = { x: landing.tx * MM + MM / 2, y: landing.ty * MM + MM / 2 }
    session.submit(1, carveCircleCommand({ ...centre, radius: 2600, amount: SOLID_DENSITY }))
    standInPocket(session, 2, UNDERGROUND, FACING.right)
    const board = boardAfterUses(EMPTY_REVEAL_BOARD, pressSlotOne(session), session.state(), 'p1')
    expect(tilesOf(board)).toContain(`${landing.tx},${landing.ty}`)
    expect(board.marks.every((mark) => distanceSq(mark.tile, landing) <= 6 * 6)).toBe(true)
    expect(boardAt(board, session.state(), 1_000_000).marks).toEqual(board.marks)
    expect(boardAfterDock(board).marks).toEqual([])
  })

  it('pins a dropped buoy for a second vehicle in the world, with its ring pinged', () => {
    const { board } = boardAfterUse(BUOY, 'p2')
    expect(board.pins).toEqual([
      expect.objectContaining({ tile: UNDERGROUND, ownerId: 'p1', ringTiles: 4 }),
    ])
    expect(board.marks.length).toBeGreaterThan(0)
  })

  it('re-pings the ring when a vehicle comes inside it, and not while one stays', () => {
    const { session, board } = boardAfterUse(BUOY, 'p2')
    const later = boardAt(board, session.state(), ACT_TICK + ECHO_REVEAL_TICKS)
    expect(later.marks).toEqual([])
    standInPocket(session, ACT_TICK + 700, UNDERGROUND, FACING.right, 'p2')
    const passed = boardAt(later, session.state(), ACT_TICK + 700)
    expect(passed.marks.length).toBeGreaterThan(0)
    expect(passed.pins[0].inside).toEqual(['p1', 'p2'])
    expect(boardAt(passed, session.state(), ACT_TICK + 701)).toBe(passed)
  })

  it('keeps at most its pin cap of buoys, the oldest leaving first', () => {
    const session = sensingSession(BUOY)
    standInPocket(session, 2, UNDERGROUND)
    const drops = Array.from({ length: BUOY_PIN_CAP + 1 }, (_, at) => buoyDropAt(at))
    const board = boardAfterUses(EMPTY_REVEAL_BOARD, drops, session.state(), 'p1')
    expect(board.pins).toHaveLength(BUOY_PIN_CAP)
    expect(board.pins[0].tile.tx).toBe(1)
  })

  it('draws nothing for a held item’s use', () => {
    const session = sensingSession()
    const probe = { ...buoyDropAt(0), itemId: 'power.galvanic_probe' }
    expect(boardAfterUses(EMPTY_REVEAL_BOARD, [probe], session.state(), 'p1')).toEqual(
      EMPTY_REVEAL_BOARD,
    )
  })

  it('changes nothing in the state it reads', () => {
    const session = sensingSession(BUOY, ['p1', 'p2'])
    standInPocket(session, 2, UNDERGROUND)
    const events = pressSlotOne(session)
    const before = stateDigest(session.state())
    boardAt(boardAfterUses(EMPTY_REVEAL_BOARD, events, session.state(), 'p2'), session.state(), 99)
    expect(stateDigest(session.state())).toBe(before)
  })
})

/** A logged buoy drop by p1 at tile column `at`, as power-up-core writes it. */
function buoyDropAt(at: number): DomainEvent {
  return {
    type: 'power-up-core.PowerUpUsed',
    tick: ACT_TICK + at,
    playerId: 'p1',
    seq: at + 1,
    itemId: 'consumable.signal_buoy',
    slot: 'powerup.1',
    mark: 1,
    originTx: at,
    originTy: UNDERGROUND.ty,
    chargesLeft: 2,
  } as DomainEvent
}
