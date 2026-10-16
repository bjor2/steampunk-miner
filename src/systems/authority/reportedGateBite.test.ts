import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { FACING } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import { toCanonicalJson } from './canonicalJson'
import type { DomainEvent } from './domainEvent'
import { drillGearCellsAt } from '../vehicle/drillGearCells'
import { drillStampOf } from '../vehicle/drillStamp'
import {
  drillGatedAt,
  drillGatedOf,
  drillGearOf,
  holdDrillOver,
  refusingGateAt,
} from './gatedBiteFixtures'
import {
  continueScriptedSession,
  createScriptedSession,
  drill,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
} from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'

// A pose report's drill raises `DrillGated` once per gated cell it holds (ticket 519, the TD
// ruling 6225185887 on #519); the first meeting always fires.

const [ORE_TILE] = surfaceOreTiles(1)
const GATE = refusingGateAt([ORE_TILE])

/** A tile far enough from `ORE_TILE` that the drill there never meets it. */
const AWAY: TilePoint = { tx: ORE_TILE.tx + 8, ty: ORE_TILE.ty }

describe('reported drill gate bite', () => {
  it('raises a held gated cell once across reports every 12 ticks', () => {
    const lines = withRegistrations([GATE], () => {
      const held = holdDrillOver(createScriptedSession(), ORE_TILE, 1, 6, { interval: 12 })
      return drillGatedAt(held.events, ORE_TILE)
    })
    expect(lines).toHaveLength(1)
  })

  it('raises a held gated cell once across reports every tick, where each report met it', () => {
    const { lines, reportsMeeting } = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      let reportsMeeting = 0
      const events: DomainEvent[][] = []
      for (let tick = 2; tick <= 61; tick++) {
        events.push(...holdDrillOver(session, ORE_TILE, tick - 1, 1, { interval: 1 }).events)
        if (session.vehicle().gatedBite !== undefined) reportsMeeting++
      }
      return { lines: drillGatedAt(events, ORE_TILE), reportsMeeting }
    })
    expect(reportsMeeting).toBe(60)
    expect(lines).toHaveLength(1)
  })

  it('raises the cell on the first drilling report after a drill-off approach at interval 1', () => {
    const firstDrill = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      for (let tick = 1; tick <= 10; tick++) session.submit(tick, poseAbove(ORE_TILE, FACING.down))
      const reports = holdDrillOver(session, ORE_TILE, 10, 12, { interval: 1 }).events
      return reports.map((events) => drillGatedOf(events).length)
    })
    expect(firstDrill[0]).toBe(1)
    expect(firstDrill.slice(1).every((lines) => lines === 0)).toBe(true)
  })

  it('raises the cell again once the drill is released and pressed again', () => {
    const lines = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      const before = holdDrillOver(session, ORE_TILE, 1, 3, { interval: 12 })
      session.submit(before.lastTick + 12, poseAbove(ORE_TILE, FACING.down))
      const after = holdDrillOver(session, ORE_TILE, before.lastTick + 12, 3, { interval: 12 })
      return drillGatedAt([...before.events, ...after.events], ORE_TILE)
    })
    expect(lines).toHaveLength(2)
  })

  it('raises the cell again after the drill leaves it and comes back', () => {
    const lines = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      const first = holdDrillOver(session, ORE_TILE, 1, 2, { interval: 12 })
      const away = holdDrillOver(session, AWAY, first.lastTick, 1, { interval: 12 })
      const back = holdDrillOver(session, ORE_TILE, away.lastTick, 2, { interval: 12 })
      return drillGatedAt([...first.events, ...away.events, ...back.events], ORE_TILE)
    })
    expect(lines).toHaveLength(2)
  })

  it('raises the cell again on the report after a scripted drill of it', () => {
    const lines = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      const first = holdDrillOver(session, ORE_TILE, 1, 2, { interval: 12 })
      const scripted = session.submit(first.lastTick + 12, drill(ORE_TILE, 12))
      const next = holdDrillOver(session, ORE_TILE, first.lastTick + 12, 2, { interval: 12 })
      return drillGatedAt([...first.events, scripted, ...next.events], ORE_TILE)
    })
    expect(lines).toHaveLength(3)
  })

  it('raises a gated cell only the side cutters meet once, then leaves it out', () => {
    const target = { tx: ORE_TILE.tx - 2, ty: ORE_TILE.ty - 1 }
    const ask = { aheadCells: 0, sideCells: 2 }
    const pose = poseAbove(target, FACING.down).payload
    const disc = drillStampOf({ ...pose, facing: FACING.down }, false)
    expect(drillGearCellsAt({ ...pose, facing: FACING.down }, disc, ask).side).toContainEqual(
      ORE_TILE,
    )
    const bare = withRegistrations([GATE], () =>
      holdDrillOver(createScriptedSession(), target, 1, 3, { interval: 12 }),
    )
    const geared = withRegistrations([GATE, drillGearOf(ask)], () =>
      holdDrillOver(createScriptedSession(), target, 1, 3, { interval: 12 }),
    )
    expect(drillGatedAt(bare.events, ORE_TILE)).toEqual([])
    expect(geared.events.map((events) => drillGatedOf(events).length)).toEqual([1, 0, 0])
  })

  it('raises a gated cell only the twin bit meets once, then leaves it out', () => {
    const ask = { aheadCells: 1, sideCells: 0, aheadBearing: 'left' as const }
    const target = targetWithDiagonalOn(ORE_TILE, ask)
    const drive = { x: 1, y: -1 } as const
    const bare = withRegistrations([GATE], () =>
      holdDrillOver(createScriptedSession(), target, 1, 3, { interval: 12, drive }),
    )
    const twin = drillGearOf({ aheadCells: 1, aheadAim: 'drive' })
    const geared = withRegistrations([GATE, twin], () =>
      holdDrillOver(createScriptedSession(), target, 1, 3, { interval: 12, drive }),
    )
    expect(drillGatedAt(bare.events, ORE_TILE)).toEqual([])
    expect(geared.events.map((events) => drillGatedAt([events], ORE_TILE).length)).toEqual([
      1, 0, 0,
    ])
  })

  it("never leaves out a second player's first meeting of a cell another player holds", () => {
    const { p1, p2 } = withRegistrations([GATE], () => {
      const session = createScriptedSession(['p1', 'p2'])
      const first = holdDrillOver(session, ORE_TILE, 1, 3, { interval: 12 })
      const second = holdDrillOver(session, ORE_TILE, first.lastTick, 3, {
        interval: 12,
        playerId: 'p2',
      })
      return {
        p1: drillGatedAt(first.events, ORE_TILE),
        p2: drillGatedAt(second.events, ORE_TILE),
      }
    })
    expect(p1).toHaveLength(1)
    expect(p2).toHaveLength(1)
  })

  it('keeps the bite on the vehicle only while a report meets a gated cell', () => {
    const { ungated, held, released } = withRegistrations([GATE], () => {
      const ungatedSession = createScriptedSession()
      holdDrillOver(ungatedSession, AWAY, 1, 2, { interval: 12 })
      const session = createScriptedSession()
      holdDrillOver(session, ORE_TILE, 1, 2, { interval: 12 })
      const heldBite = session.vehicle().gatedBite
      session.submit(37, poseAbove(ORE_TILE, FACING.down))
      return { ungated: ungatedSession.state(), held: heldBite, released: session.state() }
    })
    expect(toCanonicalJson(ungated)).not.toContain('gatedBite')
    expect(held).toEqual({ tick: 25, cells: [ORE_TILE] })
    expect(toCanonicalJson(released)).not.toContain('gatedBite')
  })

  it('ends the bite when the vehicle docks', () => {
    const vehicle = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      holdDrillOver(session, ORE_TILE, 1, 2, { interval: 12 })
      session.submit(30, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
      return session.vehicle()
    })
    expect(vehicle.mode).toBe('docked')
    expect(vehicle.gatedBite).toBeUndefined()
  })

  it('ends the bite on a new planet', () => {
    const vehicle = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      holdDrillOver(session, ORE_TILE, 1, 2, { interval: 12 })
      session.submit(30, { type: 'debug.setPlanet', payload: { planetIndex: 2 } })
      return session.vehicle()
    })
    expect(vehicle.gatedBite).toBeUndefined()
  })

  it('leaves out the same repeat after a mid-bite snapshot is restored', () => {
    const { straight, restored } = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      const first = holdDrillOver(session, ORE_TILE, 1, 2, { interval: 12 })
      const read = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in read)) throw new Error(read.problems.join('; '))
      const resumed = continueScriptedSession(read.state)
      return {
        straight: holdDrillOver(session, ORE_TILE, first.lastTick, 3, { interval: 12 }).events,
        restored: holdDrillOver(resumed, ORE_TILE, first.lastTick, 3, { interval: 12 }).events,
      }
    })
    expect(drillGatedAt(restored, ORE_TILE)).toEqual([])
    expect(restored).toEqual(straight)
  })

  it('restores a snapshot taken with no bite and raises the next meeting as before', () => {
    const lines = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      session.submit(1, poseAbove(ORE_TILE, FACING.down))
      const snapshot = JSON.parse(JSON.stringify(takeSnapshot(session.state())))
      expect(snapshot.state.players.p1.vehicle).not.toHaveProperty('gatedBite')
      const read = readSnapshot(snapshot)
      if (!('state' in read)) throw new Error(read.problems.join('; '))
      const resumed = continueScriptedSession(read.state)
      return drillGatedAt(holdDrillOver(resumed, ORE_TILE, 1, 3, { interval: 12 }).events, ORE_TILE)
    })
    expect(lines).toHaveLength(1)
  })

  it('refuses a snapshot whose bite is malformed', () => {
    const snapshot = withRegistrations([GATE], () => {
      const session = createScriptedSession()
      holdDrillOver(session, ORE_TILE, 1, 2, { interval: 12 })
      return JSON.parse(JSON.stringify(takeSnapshot(session.state())))
    })
    snapshot.state.players.p1.vehicle.gatedBite = { tick: 25, cells: [{ tx: 'a' }] }
    expect(readSnapshot(snapshot).problems).toContainEqual(
      expect.stringContaining('players.p1.vehicle.gatedBite'),
    )
  })
})

/** The drill target, facing down, whose twin-bit diagonal on the ask's bearing is `cell`. */
function targetWithDiagonalOn(
  cell: TilePoint,
  ask: { aheadCells: number; sideCells: number; aheadBearing: 'left' | 'right' },
): TilePoint {
  const probe = { tx: 30, ty: 285 }
  const pose = { ...poseAbove(probe, FACING.down).payload, facing: FACING.down }
  const [diagonal] = drillGearCellsAt(pose, drillStampOf(pose, false), ask).ahead
  const target = { tx: cell.tx + probe.tx - diagonal.tx, ty: cell.ty + probe.ty - diagonal.ty }
  if (kindOfCell(cellAt(EMPTY_WORLD, PARAMS, target)) === CELL_KIND.ore) {
    throw new Error('the twin-bit target is itself ore')
  }
  return target
}
