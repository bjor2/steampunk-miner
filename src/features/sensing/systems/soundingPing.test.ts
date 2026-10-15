import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { GROUND } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { researchedMarkOf } from '../../tech-tree'
import { MM, researchThrough, sensingSession } from '../sensingTestSession'
import { boardAfterBores, boardAfterHeard, boardAt, EMPTY_REVEAL_BOARD } from './revealBoard'
import { echoRevealTicksAtTopMark } from './revealReach'
import { soundingEchoTicksAt, soundingRadiusAt } from './soundingPing'
import { ECHO_SOUNDER } from './sensingUses'

// The sounding bore's echo (ticket 415, TD lock 6180863028 on #320 section 2): the local player's
// `BoreEnded` carrying `lineCells` pings the tiles within the radius of those cells for the echo
// time, both lifted by the echo sounder's Mark toward capped, asymptotic limits.

const UNDERGROUND = { tx: GROUND.tx, ty: GROUND.ty - 20 }
const LINE: TilePoint[] = [0, 1, 2, 3].map((at) => ({
  tx: UNDERGROUND.tx + at,
  ty: UNDERGROUND.ty,
}))
const END_TICK = 40
/** A bought echo's reveal (#162 4.2), the sounding echo's base. */
const BOUGHT_ECHO_TICKS = 600

/** A bore line ended by `playerId` at `END_TICK`, as the kernel stamps it. */
function boreEndedBy(playerId: string, lineCells?: readonly TilePoint[]): DomainEvent {
  return {
    type: 'BoreEnded',
    tick: END_TICK,
    playerId,
    stop: 'range',
    tx: LINE[LINE.length - 1].tx,
    ty: LINE[LINE.length - 1].ty,
    cellsOpened: lineCells?.length ?? 0,
    ...(lineCells === undefined ? {} : { lineCells }),
  } as DomainEvent
}

/** A session with a cave carved along the line, so every tile near it marks as cave. */
function sessionWithBoredCave(players: readonly string[] = ['p1']) {
  const session = sensingSession(undefined, players)
  LINE.forEach((tile) => {
    const centre = { x: tile.tx * MM + MM / 2, y: tile.ty * MM + MM / 2 }
    session.submit(1, carveCircleCommand({ ...centre, radius: 4_000, amount: SOLID_DENSITY }))
  })
  session.advanceTo(2)
  return session
}

const nearestLineDistanceSq = (tile: TilePoint) =>
  Math.min(...LINE.map((cell) => (cell.tx - tile.tx) ** 2 + (cell.ty - tile.ty) ** 2))

const keysOf = (tiles: readonly TilePoint[]) => tiles.map(({ tx, ty }) => `${tx},${ty}`)

describe('sensing sounding bore echo', () => {
  it('marks every line cell and its tiles within the bought 2-tile radius, each once', () => {
    const session = sessionWithBoredCave()
    const board = boardAfterBores(
      EMPTY_REVEAL_BOARD,
      [boreEndedBy('p1', LINE)],
      session.state(),
      'p1',
    )
    const tiles = board.marks.map((mark) => mark.tile)
    expect(keysOf(tiles)).toEqual(expect.arrayContaining(keysOf(LINE)))
    expect(tiles.every((tile) => nearestLineDistanceSq(tile) <= 2 * 2)).toBe(true)
    expect(tiles.some((tile) => nearestLineDistanceSq(tile) === 2 * 2)).toBe(true)
    expect(new Set(keysOf(tiles)).size).toBe(tiles.length)
  })

  it('keeps the echo for a bought echo’s 600 ticks from the line’s end, then lets it go', () => {
    const session = sessionWithBoredCave()
    const state = session.state()
    const board = boardAfterBores(EMPTY_REVEAL_BOARD, [boreEndedBy('p1', LINE)], state, 'p1')
    expect(board.marks.every((mark) => mark.bornTick === END_TICK)).toBe(true)
    expect(boardAt(board, state, END_TICK + BOUGHT_ECHO_TICKS - 1).marks).toHaveLength(
      board.marks.length,
    )
    expect(boardAt(board, state, END_TICK + BOUGHT_ECHO_TICKS).marks).toEqual([])
  })

  it('lifts the radius and the echo time with the Mark, never past their caps', () => {
    const marks = Array.from({ length: 30 }, (_, at) => at + 1)
    const radii = marks.map(soundingRadiusAt)
    const echoes = marks.map(soundingEchoTicksAt)
    expect([soundingRadiusAt(0), radii[0], radii[1], radii[2]]).toEqual([2, 2, 4, 5])
    expect([echoes[0], echoes[1], echoes[2]]).toEqual([600, 900, 1050])
    expect(radii.every((radius, at) => at === 0 || radius >= radii[at - 1])).toBe(true)
    expect(echoes.every((ticks, at) => at === 0 || ticks >= echoes[at - 1])).toBe(true)
    expect(Math.max(...radii)).toBeLessThan(6)
    expect(Math.max(...echoes)).toBeLessThanOrEqual(echoRevealTicksAtTopMark())
  })

  it('pings at the echo sounder’s researched Mark', () => {
    const session = sessionWithBoredCave()
    session.submit(3, researchThrough(60))
    session.advanceTo(4)
    const state = session.state()
    const mark = researchedMarkOf(state, 'p1', ECHO_SOUNDER)
    expect(mark).toBeGreaterThan(1)
    const board = boardAfterBores(EMPTY_REVEAL_BOARD, [boreEndedBy('p1', LINE)], state, 'p1')
    expect(board.marks[0].untilTick).toBe(END_TICK + soundingEchoTicksAt(mark))
    const reaches = board.marks.map((m) => nearestLineDistanceSq(m.tile))
    expect(Math.max(...reaches)).toBeGreaterThan(2 * 2)
    expect(Math.max(...reaches)).toBeLessThanOrEqual(soundingRadiusAt(mark) ** 2)
  })

  it('draws nothing for a line with no cells carried, or an empty one', () => {
    const session = sessionWithBoredCave()
    const heard = [boreEndedBy('p1'), boreEndedBy('p1', [])]
    expect(boardAfterBores(EMPTY_REVEAL_BOARD, heard, session.state(), 'p1')).toBe(
      EMPTY_REVEAL_BOARD,
    )
  })

  it('draws only the local player’s own shot', () => {
    const session = sessionWithBoredCave(['p1', 'p2'])
    const heard = [boreEndedBy('p1', LINE)]
    expect(boardAfterHeard(EMPTY_REVEAL_BOARD, heard, session.state(), 'p2')).toBe(
      EMPTY_REVEAL_BOARD,
    )
    expect(boardAfterHeard(EMPTY_REVEAL_BOARD, heard, session.state(), 'p1').marks).not.toEqual([])
  })

  it('changes nothing in the state it reads', () => {
    const session = sessionWithBoredCave()
    const before = stateDigest(session.state())
    boardAfterBores(EMPTY_REVEAL_BOARD, [boreEndedBy('p1', LINE)], session.state(), 'p1')
    expect(stateDigest(session.state())).toBe(before)
  })
})
