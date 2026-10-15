import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { BoreGunStats, ShotShape } from '../../registries/boreGun'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import { ofType } from '../charges/chargeFixtures'
import { createScriptedSession, type ScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { nextShotTickOf } from './boreFire'
import { BORE_STATS, FIRE_EAST, fireAt, lineEastOf, PLAIN_RIG, standInPocket } from './boreFixtures'
import { BORE_EVENT_CAPS, boreFarEndOf } from './boreLine'
import BORE_BEARINGS from './boreBearings.json'
import { boresOf } from './boreState'
import { SHOT_SHAPE_CAPS } from './shotShape'

// K-line (ticket 412, the TD lock on #320): the line that ends a shot carries the cells the shot
// opened as `BoreEnded.lineCells`, only while a registered listener wants them, and
// `boreFarEndOf` reads the last opened cell of the player's latest bore from the saved bores.

const FIRE_TICK = 10
/** Long enough for every line of a shot up to 16 cells long to open and end. */
const END_TICK = FIRE_TICK + 40
/** Down and to the right of due east, through rock the first shot left solid. */
const SECOND_BEARING = 200

const ONE_LINE: ShotShape = {
  lineOffsets: [],
  seamTurns: 0,
  liningGrade: null,
  extraEnergyPerCellBp: 0,
  groundTicks: null,
  strutTicks: null,
}
/** Two lines: due east, and 40 bearing steps below it. */
const SPLAY: ShotShape = { ...ONE_LINE, lineOffsets: [-40] }
/** The widest shape the caps allow: five lines, each with every seam turn. */
const WIDEST: ShotShape = {
  ...ONE_LINE,
  lineOffsets: [-20, -40, -60, -80],
  seamTurns: SHOT_SHAPE_CAPS.maxSeamTurns,
}
/** A gun whose budget and energy never stop a line before its range. */
const DEEP_GUN: BoreGunStats = {
  ...BORE_STATS,
  boreBudgetTicks: 100000,
  energyPerCellBp: 10000,
}

interface Asked {
  playerId: string
  tick: number
}

/** A gun answering `shape`, and a listener answering `wants` that notes every ask. */
function listenedGun(
  wants: boolean | null,
  shape: ShotShape = ONE_LINE,
  stats: BoreGunStats = BORE_STATS,
  asked: Asked[] = [],
): SliceDefinition {
  return {
    id: 'probe',
    register(r) {
      r.boreGun({ id: 'probe.bore-gun', boreGunOf: () => stats, shotShapeOf: () => shape })
      if (wants !== null) r.boreLineListener(noteAsks(wants, asked))
    },
  }
}

function noteAsks(wants: boolean, asked: Asked[]) {
  return {
    id: 'probe.line',
    wantsLine: (state: AuthorityState, playerId: string) => {
      asked.push({ playerId, tick: state.tick })
      return wants
    },
  }
}

function shootEast(): ScriptedSession {
  const session = createScriptedSession()
  standInPocket(session, PLAIN_RIG, 0)
  session.submit(FIRE_TICK, FIRE_EAST)
  session.advanceTo(END_TICK)
  return session
}

/** The east shot, then a second down-right as soon as the gun has recovered. */
function shootTwice(): { session: ScriptedSession; secondTick: number } {
  const session = shootEast()
  const secondTick = Math.max(nextShotTickOf(session.state(), 'p1'), END_TICK + 1)
  session.submit(secondTick, fireAt(SECOND_BEARING))
  session.advanceTo(secondTick + END_TICK - FIRE_TICK)
  return { session, secondTick }
}

function endedOf(session: ScriptedSession) {
  return ofType(session.events(), 'BoreEnded')
}

function lineCellsOf(session: ScriptedSession): (readonly TilePoint[])[] {
  return endedOf(session).flatMap((ended) =>
    ended.lineCells === undefined ? [] : [ended.lineCells],
  )
}

/** Every pending bore's opened cells, line by line in fire order, while the lines still stand. */
function boredCellsOf(session: ScriptedSession): TilePoint[] {
  return boresOf(session.state()).flatMap((bore) => bore.bored)
}

function cellsOpenedOf(session: ScriptedSession): number {
  return endedOf(session).reduce((sum, ended) => sum + ended.cellsOpened, 0)
}

function playedWith(slice: SliceDefinition) {
  return withRegistrations([slice], () => {
    const session = shootEast()
    return { events: JSON.stringify(session.events()), digest: stateDigest(session.state()) }
  })
}

describe('bore line: the shot cells on BoreEnded (ticket 412)', () => {
  it('derives its cap of 50 cells from the range cap times the most lines of a shot', () => {
    expect(BORE_EVENT_CAPS.maxLineCells).toBe(
      BORE_BEARINGS.boreEventCaps.rangeCap * SHOT_SHAPE_CAPS.maxLines,
    )
    expect(BORE_EVENT_CAPS.maxLineCells).toBe(50)
  })

  it('carries no line cells with no listener registered', () =>
    withRegistrations([listenedGun(null)], () => {
      const [ended] = endedOf(shootEast())
      expect(ended).not.toHaveProperty('lineCells')
    }))

  it('carries no line cells for a listener that answers false', () =>
    withRegistrations([listenedGun(false)], () => {
      const [ended] = endedOf(shootEast())
      expect(ended).not.toHaveProperty('lineCells')
    }))

  it('plays the same events and digest with a listener answering false as with none', () => {
    expect(playedWith(listenedGun(false))).toEqual(playedWith(listenedGun(null)))
  })

  it('gives a listener answering true the cells the line opened, in walk order', () =>
    withRegistrations([listenedGun(true)], () => {
      expect(lineCellsOf(shootEast())).toEqual([lineEastOf(PLAIN_RIG)])
    }))

  it('moves no digest when a listener answers true, as the cells ride only on the event', () => {
    expect(playedWith(listenedGun(true)).digest).toBe(playedWith(listenedGun(null)).digest)
  })

  it('asks the listener once per shot, for the shooting player, as the shot ends', () => {
    const asked: Asked[] = []
    const { secondTick } = withRegistrations([listenedGun(true, SPLAY, BORE_STATS, asked)], () =>
      shootTwice(),
    )
    expect(asked.map(({ playerId }) => playerId)).toEqual(['p1', 'p1'])
    expect(asked[1].tick).toBeGreaterThan(secondTick)
  })

  it('puts every line of a shaped shot on the one event that ends the shot, line by line', () =>
    withRegistrations([listenedGun(true, SPLAY)], () => {
      const session = shootEast()
      const ended = endedOf(session)
      expect(ended).toHaveLength(2)
      expect(ended[0]).not.toHaveProperty('lineCells')
      expect(ended[1].lineCells).toEqual(boredCellsOf(session))
      expect(ended[1].lineCells).toHaveLength(cellsOpenedOf(session))
    }))

  it('carries one list per shot over two shots, each its own shot cells', () =>
    withRegistrations([listenedGun(true)], () => {
      const lines = lineCellsOf(shootTwice().session)
      expect(lines).toHaveLength(2)
      expect(lines[0]).toEqual(lineEastOf(PLAIN_RIG))
      expect(lines[1].length).toBeGreaterThan(0)
      expect(lines[1]).not.toEqual(lines[0])
    }))

  it('carries every cell of the widest shape at the range cap, within the 50', () => {
    const stats = { ...DEEP_GUN, rangeCells: BORE_BEARINGS.boreEventCaps.rangeCap }
    withRegistrations([listenedGun(true, WIDEST, stats)], () => {
      const session = shootEast()
      const [cells] = lineCellsOf(session)
      expect(cells).toHaveLength(cellsOpenedOf(session))
      expect(cells.length).toBeLessThanOrEqual(BORE_EVENT_CAPS.maxLineCells)
    })
  })

  it('carries the first 50 cells of a longer shot while cellsOpened still counts them all', () =>
    withRegistrations([listenedGun(true, WIDEST, { ...DEEP_GUN, rangeCells: 16 })], () => {
      const session = shootEast()
      const [cells] = lineCellsOf(session)
      expect(cellsOpenedOf(session)).toBeGreaterThan(BORE_EVENT_CAPS.maxLineCells)
      expect(cells).toEqual(boredCellsOf(session).slice(0, BORE_EVENT_CAPS.maxLineCells))
    }))
})

describe('bore line: the far end of the latest bore (ticket 412)', () => {
  it('is null with no bore fired', () =>
    withRegistrations([listenedGun(null)], () => {
      expect(boreFarEndOf(createScriptedSession().state(), 'p1')).toBeNull()
    }))

  it('is the last cell the bore opened and the tick it fired', () =>
    withRegistrations([listenedGun(null)], () => {
      const session = shootEast()
      expect(boreFarEndOf(session.state(), 'p1')).toEqual({
        tile: lineEastOf(PLAIN_RIG)[3],
        firedTick: FIRE_TICK,
      })
    }))

  it('follows the line while it still opens', () =>
    withRegistrations([listenedGun(null)], () => {
      const session = createScriptedSession()
      standInPocket(session, PLAIN_RIG, 0)
      session.submit(FIRE_TICK, FIRE_EAST)
      session.advanceTo(FIRE_TICK + 2 * BORE_STATS.openIntervalTicks)
      expect(boreFarEndOf(session.state(), 'p1')?.tile).toEqual(lineEastOf(PLAIN_RIG)[1])
    }))

  it("is the latest shot's after a second shot", () =>
    withRegistrations([listenedGun(null)], () => {
      const { session, secondTick } = shootTwice()
      expect(boreFarEndOf(session.state(), 'p1')?.firedTick).toBe(secondTick)
    }))

  it("is null for a player who fired no bore while another player's stands", () =>
    withRegistrations([listenedGun(null)], () => {
      expect(boreFarEndOf(shootEast().state(), 'p2')).toBeNull()
    }))

  it('reads the saved bores: a restored save answers the same and the digest is unmoved', () =>
    withRegistrations([listenedGun(null)], () => {
      const session = shootEast()
      const digest = stateDigest(session.state())
      const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in restored) || restored.problems.length > 0) throw new Error('refused')
      expect(boreFarEndOf(restored.state, 'p1')).toEqual(boreFarEndOf(session.state(), 'p1'))
      expect(stateDigest(session.state())).toBe(digest)
    }))
})
