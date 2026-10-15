import { describe, expect, it } from 'vitest'
import { DRILL_SPAN_CAP_TICKS, DRILL_SPAN_IDLE_TICKS } from '../constants/runLog'
import type { AuthorityCommand, CommandIntent } from '../systems/authority/authorityCommand'
import {
  createAuthorityState,
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../systems/authority/authorityState'
import type { DomainEvent, DomainEventBody } from '../systems/authority/domainEvent'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { add, div, fromCanonical, fromSafeInteger, toCanonical } from '../systems/money'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'
import { bandOfTile } from '../systems/world/planetGeometry'
import type { TilePoint } from '../systems/world/tileGrid'
import { recordDomainEventsTo } from './domainEventLog'
import { createMemorySink } from './eventSink'
import type { RunEvent } from './runEvent'
import { runEventProblems } from './runEventSchema'
import { createRunLog, type DrillLines, type RunLog } from './runLog'
import { createRunProgressSink } from './runProgress'

// Ticket 420 (TD spec on #396, GD ruling): a run of one player's drill commands logs one drill_cut
// line, and one casing_lined line per lining run, while the domain events stay per cell.

const PLACE = { playerId: 'p1', planet: 1, depthTiles: 12 }
const TEN = toCanonical(fromSafeInteger(10))
const FIFTEEN_AND_A_HALF = toCanonical(div(fromSafeInteger(31), fromSafeInteger(2)))
const UNIT = { resourceTier: 1, amount: 1, oreId: 'copper', depthTiles: 12, chunk: '0,8' }

interface Session {
  runLog: RunLog
  lines: readonly RunEvent[]
  nextSeq: number
}

function sessionOf(drillLines: DrillLines = 'spans'): Session {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0, drillLines })
  return { runLog, lines: sink.events, nextSeq: 0 }
}

/** Records `intent` sent at `tick`, then the events it answered, stamped with its seq. */
function send(
  session: Session,
  tick: number,
  intent: CommandIntent,
  bodies: readonly DomainEventBody[],
  options: { state?: AuthorityState; depthTiles?: number } = {},
): void {
  const command = { playerId: 'p1', tick, seq: session.nextSeq++, ...intent } as AuthorityCommand
  session.runLog.recordCommand(command)
  const events = bodies.map((body) => ({ ...body, playerId: 'p1', tick, seq: command.seq }))
  const place = { ...PLACE, depthTiles: options.depthTiles ?? PLACE.depthTiles }
  recordDomainEventsTo(session.runLog, place, events as DomainEvent[], options.state)
}

function drillTile(tile: TilePoint, ticks: number): CommandIntent {
  return { type: 'drillTile', payload: { ...tile, ticks } }
}

const DRILL_STEP: CommandIntent = { type: 'drillStep', payload: { x: 0, y: 0, drive: NO_DRIVE } }
const UNDOCK: CommandIntent = { type: 'undock', payload: {} }

/** What one drilling command answered: three broken cells, two of them ore that reached the hold. */
function drilledBodies(tx: number): DomainEventBody[] {
  return [
    { type: 'DrillDamageDealt', tx, ty: 270, ticks: 4, damage: '1' },
    { type: 'TileDestroyed', tx, ty: 270, kind: 'ground' },
    { type: 'TileDestroyed', tx, ty: 269, kind: 'ore' },
    { type: 'CargoAdded', ...UNIT, value: TEN },
    { type: 'TileDestroyed', tx: tx + 1, ty: 269, kind: 'ore' },
    { type: 'CargoAdded', ...UNIT, oreId: 'tin', value: FIFTEEN_AND_A_HALF },
  ]
}

function lined(band: number, grade: number, price: string): DomainEventBody {
  return { type: 'CasingLined', lengthMm: 500, band, grade, liningType: 'iron', price }
}

function namesOf(session: Session): string[] {
  return session.lines.map(({ event }) => event)
}

function drillCutsOf(session: Session): RunEvent<'drill_cut'>[] {
  return session.lines.filter((line) => line.event === 'drill_cut') as RunEvent<'drill_cut'>[]
}

/** Planet 1 of seed 1, and the first tile down column 0 in each band, surface first. */
const STATE = createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })
const PARAMS = planetParamsOf(STATE.planet)!

function tileInBand(band: number): TilePoint {
  for (let ty = PARAMS.radiusTiles; ty > 0; ty--) {
    if (bandOfTile(PARAMS, 0, ty) === band) return { tx: 0, ty }
  }
  throw new Error(`no band ${band} tile in column 0`)
}

function withEnergyAndHeat(energy: number, heat: number): AuthorityState {
  const vehicle = vehicleOf(STATE, 'p1')
  return withVehicle(STATE, 'p1', { ...vehicle, energy, heat: { ...vehicle.heat, level: heat } })
}

describe('drill_cut span line (ticket 420)', () => {
  it("logs a drill step's cells, units, value and ore runs on one line once the span closes", () => {
    const session = sessionOf()
    send(session, 40, DRILL_STEP, drilledBodies(3))
    expect(namesOf(session)).toEqual([])
    session.runLog.flushDrillSpans()
    expect(namesOf(session)).toEqual(['drill_cut'])
    expect(session.lines[0]).toMatchObject({
      tick: 40,
      cmd: [40, 0],
      data: {
        spans: 1,
        cells: 3,
        first: [3, 270],
        last: [4, 269],
        ticks: 4,
        units: 2,
        value: toCanonical(add(fromCanonical(TEN), fromCanonical(FIFTEEN_AND_A_HALF))),
        ores: [
          ['copper', 1],
          ['tin', 1],
        ],
        stop: 'end',
        lastOreDepthTiles: 12,
        lastOreChunk: '0,8',
        lastOreTick: 40,
      },
    })
    expect(session.lines.flatMap(runEventProblems)).toEqual([])
  })

  it('folds consecutive drill commands into one span and counts them', () => {
    const session = sessionOf()
    for (let index = 0; index < 4; index++) {
      send(session, 60 * (index + 1), drillTile({ tx: index, ty: 270 }, 60), drilledBodies(index))
    }
    session.runLog.flushDrillSpans()
    const [cut] = drillCutsOf(session)
    expect(drillCutsOf(session)).toHaveLength(1)
    expect(cut.data).toMatchObject({ spans: 4, cells: 12, ticks: 16, units: 8, first: [0, 270] })
    expect(cut.data.last).toEqual([4, 269])
    expect(cut.data.ores).toEqual([
      ['copper', 1],
      ['tin', 1],
      ['copper', 1],
      ['tin', 1],
      ['copper', 1],
      ['tin', 1],
      ['copper', 1],
      ['tin', 1],
    ])
  })

  it('closes a span 300 ticks after it opened, so a crash loses at most 5 s', () => {
    const session = sessionOf()
    for (let tick = 1; tick <= DRILL_SPAN_CAP_TICKS + 1; tick++) {
      send(session, tick, DRILL_STEP, [{ type: 'TileDestroyed', tx: tick, ty: 0, kind: 'ground' }])
    }
    session.runLog.flushDrillSpans()
    expect(drillCutsOf(session).map(({ tick, data }) => [tick, data.cells, data.stop])).toEqual([
      [1, DRILL_SPAN_CAP_TICKS, 'cap'],
      [DRILL_SPAN_CAP_TICKS + 1, 1, 'end'],
    ])
  })

  it('closes a span when the next drill command starts over 30 ticks after the last one ended', () => {
    const session = sessionOf()
    send(session, 100, drillTile({ tx: 0, ty: 0 }, 60), drilledBodies(0))
    send(session, 160 + DRILL_SPAN_IDLE_TICKS, drillTile({ tx: 1, ty: 0 }, 60), drilledBodies(1))
    send(session, 220 + DRILL_SPAN_IDLE_TICKS + 1 + 60, drillTile({ tx: 2, ty: 0 }, 60), [])
    expect(drillCutsOf(session).map(({ data }) => [data.spans, data.stop])).toEqual([[2, 'idle']])
  })

  it('closes a span where its cells cross into another band, so per-band reads stay exact', () => {
    const session = sessionOf()
    const [bandOne, bandTwo] = [tileInBand(1), tileInBand(2)]
    const broken = (tile: TilePoint): DomainEventBody => ({
      type: 'TileDestroyed',
      ...tile,
      kind: 'ground',
    })
    send(session, 1, DRILL_STEP, [broken(bandOne), broken(bandTwo), broken(bandTwo)], {
      state: STATE,
    })
    session.runLog.flushDrillSpans()
    expect(drillCutsOf(session).map(({ data }) => [data.first, data.cells, data.stop])).toEqual([
      [[bandOne.tx, bandOne.ty], 1, 'band'],
      [[bandTwo.tx, bandTwo.ty], 2, 'end'],
    ])
  })

  it('shows a gate hit at its exact cell, after the span of the cells cut before it', () => {
    const session = sessionOf()
    const gated: DomainEventBody = {
      type: 'DrillGated',
      tx: 5,
      ty: 269,
      oreId: 'kernel.metal.t3',
      family: 'metal',
      tier: 3,
      gateKind: 'tip',
      outcome: 'refused',
      required: 'tip 4',
      have: 'tip 2',
    }
    send(session, 40, DRILL_STEP, [...drilledBodies(3), gated])
    expect(namesOf(session)).toEqual(['drill_cut', 'gate_hit'])
    expect(session.lines[0].data).toMatchObject({ last: [4, 269], stop: 'gate' })
    expect(session.lines[1].data).toMatchObject({ tx: 5, ty: 269, outcome: 'refused' })
  })

  it("closes a span with its player's next command that has events, before that command's lines", () => {
    const session = sessionOf()
    send(session, 40, DRILL_STEP, drilledBodies(3))
    send(session, 41, UNDOCK, [
      { type: 'VehicleModeChanged', from: 'docked', to: 'active', reason: 'undock' },
    ])
    expect(namesOf(session)).toEqual(['drill_cut', 'vehicle_state_changed'])
    expect(session.lines[0].data).toMatchObject({ stop: 'command' })
  })

  it('writes one casing_lined line per lining run, its rings, lengths and prices summed exactly', () => {
    const session = sessionOf()
    send(session, 1, DRILL_STEP, [lined(1, 1, TEN), lined(1, 1, FIFTEEN_AND_A_HALF)])
    send(session, 2, DRILL_STEP, [lined(1, 1, TEN), lined(1, 2, TEN)])
    session.runLog.flushDrillSpans()
    const casing = session.lines.filter((line) => line.event === 'casing_lined')
    expect(casing.map(({ tick, data }) => [tick, data])).toEqual([
      [
        1,
        {
          lengthMm: 1500,
          band: 1,
          grade: 1,
          type: 'iron',
          price: toCanonical(div(fromSafeInteger(71), fromSafeInteger(2))),
          rings: 3,
        },
      ],
      [2, { lengthMm: 500, band: 1, grade: 2, type: 'iron', price: TEN, rings: 1 }],
    ])
    expect(drillCutsOf(session).map(({ data }) => data.stop)).toEqual(['band', 'end'])
  })

  it("logs the vehicle's net energy and heat over the span, read before and after it", () => {
    const session = sessionOf()
    send(session, 1, UNDOCK, [], { state: withEnergyAndHeat(9600, 10) })
    send(session, 2, DRILL_STEP, drilledBodies(0), { state: withEnergyAndHeat(9592, 14) })
    send(session, 3, DRILL_STEP, drilledBodies(2), { state: withEnergyAndHeat(9584, 19) })
    session.runLog.flushDrillSpans()
    expect(drillCutsOf(session)[0].data).toMatchObject({ energy: -16, heat: 9 })
  })

  it('stamps the span as deep as it went, at its first broken cell', () => {
    const session = sessionOf()
    send(session, 1, DRILL_STEP, drilledBodies(0), { depthTiles: 20 })
    send(session, 2, DRILL_STEP, drilledBodies(2), { depthTiles: 23 })
    send(session, 3, DRILL_STEP, drilledBodies(4), { depthTiles: 21 })
    session.runLog.flushDrillSpans()
    expect(drillCutsOf(session)[0]).toMatchObject({ tick: 1, cmd: [1, 0], depthTiles: 23 })
  })

  it('keeps one line per cell when the run log is asked for the pre-compaction stream', () => {
    const session = sessionOf('cells')
    send(session, 40, DRILL_STEP, drilledBodies(3))
    expect(namesOf(session)).toEqual([
      'drill_damage_dealt',
      'tile_destroyed',
      'tile_destroyed',
      'resource_collected',
      'tile_destroyed',
      'resource_collected',
    ])
  })

  it('counts a drill_cut line into the run progress as its cells and units', () => {
    const session = sessionOf()
    send(session, 40, DRILL_STEP, drilledBodies(3))
    session.runLog.flushDrillSpans()
    const progress = createRunProgressSink()
    for (const line of session.lines) progress.append(line)
    expect(progress.progress()).toMatchObject({ tilesDestroyed: 3, mineralsCollected: 2 })
  })
})
