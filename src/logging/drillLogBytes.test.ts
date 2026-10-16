import { describe, expect, it } from 'vitest'
import { POSE_REPORT_INTERVAL_TICKS } from '../constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../constants/physics'
import type { AuthorityCommand, CommandIntent } from '../systems/authority/authorityCommand'
import type { DomainEvent, DomainEventBody } from '../systems/authority/domainEvent'
import { startLevels } from '../systems/economy/vehicleStats'
import { recordDomainEventsTo } from './domainEventLog'
import { createNdjsonSink, type RunLogTransport } from './eventSink'
import { bandOneCellsPerSecond } from './planetOneDrillPace'
import { createRunLog, type RunLog } from './runLog'

// Ticket 420 acceptance 1 (TD spec on #396 section 1, the Vertical Scaler's conditions): an hour
// of continuous swept drilling, a `drillStep` every tick and a pose report at 5 Hz, logged as the
// game logs it (NDJSON sink, a flush every second), writes events plus commands within 5% of each
// other at 1x, 10x and 100x the planet 1 band-1 speed, and at most 6 MB. The domain events are a
// synthetic stand-in for the swept cut's: a cell per metre of travel times the speed's cells per
// metre, a unit every fourth cell, a lined ring every half metre. Nothing is dropped: the bytes
// stay flat because a span's line is bounded by time, not by cells.

const HOUR_TICKS = 60 * 60 * TICKS_PER_SECOND
const FLUSH_TICKS = TICKS_PER_SECOND
const RING_MM = 500
const ORE_EVERY_CELLS = 4
const BAND_ONE_SPEED = bandOneCellsPerSecond(startLevels())
const SIX_MEGABYTES = 6 * 1024 * 1024
const DOWN = { x: 0, y: -1 } as const
const START = { x: 30_500, y: 261_500 }
const PLACE = { playerId: 'p1', planet: 1, depthTiles: 40 }

interface Byte {
  events: number
  commands: number
}

function countingTransport(bytes: Byte): RunLogTransport {
  return {
    appendRunEvents: async (_runId, text) => void (bytes.events += text.length),
    appendRunCommands: async (_runId, text) => void (bytes.commands += text.length),
  }
}

/** The drill's state over the hour: where it is, its seq and the cells and rings it owes. */
interface Drill {
  tick: number
  seq: number
  yMm: number
  cellRow: number
  cellsOwed: number
  ringMmOwed: number
  cellsBroken: number
}

/** One hour of drilling at `speed` times band 1's start speed, logged; its bytes and cells. */
async function drillForAnHour(speed: number): Promise<Byte & { cells: number }> {
  const bytes: Byte = { events: 0, commands: 0 }
  const sink = createNdjsonSink(countingTransport(bytes))
  const runLog = createRunLog({ runId: 'run_bytes', sink, secondsSinceStart: () => 0 })
  const drill: Drill = {
    tick: 0,
    seq: 0,
    yMm: START.y,
    cellRow: 260,
    cellsOwed: 0,
    ringMmOwed: 0,
    cellsBroken: 0,
  }
  const metresPerTick = (speed * BAND_ONE_SPEED) / TICKS_PER_SECOND
  for (drill.tick = 1; drill.tick <= HOUR_TICKS; drill.tick++) {
    stepDrill(runLog, drill, metresPerTick)
    if (drill.tick % FLUSH_TICKS === 0) await flushLikeTheGame(runLog, sink)
  }
  await flushLikeTheGame(runLog, sink)
  return { ...bytes, cells: drill.cellsBroken }
}

async function flushLikeTheGame(runLog: RunLog, sink: { flush(): Promise<void> }) {
  runLog.flushDrillSpans()
  await sink.flush()
}

function stepDrill(runLog: RunLog, drill: Drill, metresPerTick: number): void {
  drill.yMm -= Math.round(metresPerTick * MM_PER_METRE)
  if (drill.tick % POSE_REPORT_INTERVAL_TICKS === 0) send(runLog, drill, poseOf(drill), [])
  const payload = { x: START.x, y: drill.yMm, facing: 2, drive: DOWN }
  send(runLog, drill, { type: 'drillStep', payload }, [
    ...brokenCells(drill, metresPerTick),
    ...linedRings(drill, metresPerTick),
  ])
}

function send(
  runLog: RunLog,
  drill: Drill,
  intent: CommandIntent,
  bodies: readonly DomainEventBody[],
): void {
  const stamp = { playerId: 'p1', tick: drill.tick, seq: drill.seq++ }
  runLog.recordCommand({ ...stamp, ...intent } as AuthorityCommand)
  const events = bodies.map((body) => ({ ...body, ...stamp }) as DomainEvent)
  recordDomainEventsTo(runLog, PLACE, events)
}

function poseOf(drill: Drill): CommandIntent {
  return {
    type: 'reportPose',
    payload: {
      ...{ x: START.x, y: drill.yMm, vx: 0, vy: -1500, upx: 0, upy: 1024, facing: 2 },
      ...{ driving: false, thrusting: false, drilling: true },
      ...{ thrustTicks: 0, driveTicks: 0, drillTicks: POSE_REPORT_INTERVAL_TICKS },
      drive: DOWN,
    },
  }
}

function brokenCells(drill: Drill, cellsPerTick: number): DomainEventBody[] {
  drill.cellsOwed += cellsPerTick
  const bodies: DomainEventBody[] = []
  for (; drill.cellsOwed >= 1; drill.cellsOwed -= 1) bodies.push(...cellBodies(drill))
  return bodies
}

function cellBodies(drill: Drill): DomainEventBody[] {
  drill.cellsBroken += 1
  const tile = { tx: 30, ty: drill.cellRow-- }
  const isOre = drill.cellsBroken % ORE_EVERY_CELLS === 0
  const destroyed: DomainEventBody = {
    type: 'TileDestroyed',
    ...tile,
    kind: isOre ? 'ore' : 'ground',
  }
  if (!isOre) return [destroyed]
  const unit: DomainEventBody = {
    type: 'CargoAdded',
    resourceTier: 1,
    amount: 1,
    value: '1.2e+1',
    oreId: 'kernel.metal.t1',
    depthTiles: 40,
    chunk: '0,8',
  }
  return [destroyed, unit]
}

function linedRings(drill: Drill, metresPerTick: number): DomainEventBody[] {
  drill.ringMmOwed += metresPerTick * MM_PER_METRE
  const bodies: DomainEventBody[] = []
  for (; drill.ringMmOwed >= RING_MM; drill.ringMmOwed -= RING_MM) {
    bodies.push({ type: 'CasingPlaced', samples: 12, relined: 0, grade: 1 })
    bodies.push({
      type: 'CasingLined',
      lengthMm: RING_MM,
      band: 1,
      grade: 1,
      liningType: 'iron',
      price: '2.5e+0',
    })
  }
  return bodies
}

function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2)
}

const SPEEDS = [1, 10, 100]
let hoursAtSpeeds: Promise<(Byte & { cells: number })[]> | null = null

/** The three hours, drilled once and shared by the specs. */
function drillAtEverySpeed() {
  hoursAtSpeeds ??= SPEEDS.reduce(
    async (done, speed) => [...(await done), await drillForAnHour(speed)],
    Promise.resolve([] as (Byte & { cells: number })[]),
  )
  return hoursAtSpeeds
}

describe('run log bytes flat in dig speed (ticket 420)', () => {
  it('writes events and commands within 5% of each other at 1x, 10x and 100x the band-1 speed', async () => {
    const hours = await drillAtEverySpeed()
    const totals = hours.map(({ events, commands }) => events + commands)
    for (const [index, hour] of hours.entries()) {
      console.log(
        `${SPEEDS[index]}x: ${megabytes(hour.events)} MB events, ${megabytes(hour.commands)} MB ` +
          `commands, ${hour.cells} cells, ${(totals[index] / hour.cells).toFixed(1)} bytes a cell`,
      )
    }
    expect(hours[2].cells).toBeGreaterThan(hours[0].cells * 90)
    expect(Math.max(...totals) / Math.min(...totals)).toBeLessThanOrEqual(1.05)
  }, 600_000)

  it('writes at most 6 MB an hour of continuous drill steps at 60 Hz', async () => {
    for (const { events, commands } of await drillAtEverySpeed()) {
      expect(events + commands).toBeLessThanOrEqual(SIX_MEGABYTES)
    }
  }, 600_000)
})
