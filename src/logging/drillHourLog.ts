/**
 * An hour of play logged as the game logs it (NDJSON sink, a flush every second), counting the
 * bytes of `events.ndjson` and `commands.ndjson`: the log budget specs' harness (tickets 420 and
 * 522). The drill's domain events are a synthetic stand-in for a cut's down a one-cell column: a
 * cell a metre, a unit every fourth cell, a lined ring every half metre. Used by the specs only.
 */
import { MM_PER_METRE, TICKS_PER_SECOND } from '../constants/physics'
import type { AuthorityCommand, CommandIntent } from '../systems/authority/authorityCommand'
import type { DomainEvent, DomainEventBody } from '../systems/authority/domainEvent'
import { recordDomainEventsTo } from './domainEventLog'
import { createNdjsonSink, type FlushableSink, type RunLogTransport } from './eventSink'
import { createRunLog, type RunLog } from './runLog'

export const HOUR_TICKS = 60 * 60 * TICKS_PER_SECOND
const FLUSH_TICKS = TICKS_PER_SECOND
const RING_MM = 500
const ORE_EVERY_CELLS = 4
const PLACE = { playerId: 'p1', planet: 1, depthTiles: 40 }

export interface LogBytes {
  events: number
  commands: number
}

/** The logged hour: its run log, the bytes written so far, and the drill's cut state. */
export interface LoggedHour {
  runLog: RunLog
  sink: FlushableSink
  bytes: LogBytes
  tick: number
  seq: number
  cellRow: number
  cellsOwed: number
  ringMmOwed: number
  cellsBroken: number
}

export function startLoggedHour(): LoggedHour {
  const bytes: LogBytes = { events: 0, commands: 0 }
  const sink = createNdjsonSink(countingTransport(bytes))
  const runLog = createRunLog({ runId: 'run_bytes', sink, secondsSinceStart: () => 0 })
  return { runLog, sink, bytes, tick: 0, seq: 0, cellRow: 260, ...NO_CUT, cellsBroken: 0 }
}

const NO_CUT = { cellsOwed: 0, ringMmOwed: 0 }

function countingTransport(bytes: LogBytes): RunLogTransport {
  return {
    appendRunEvents: async (_runId, text) => void (bytes.events += text.length),
    appendRunCommands: async (_runId, text) => void (bytes.commands += text.length),
  }
}

/** Plays `stepTick` on every tick of the hour, flushing like the game; the bytes and cells after. */
export async function playLoggedHour(
  stepTick: (hour: LoggedHour) => void,
): Promise<LogBytes & { cells: number }> {
  const hour = startLoggedHour()
  for (hour.tick = 1; hour.tick <= HOUR_TICKS; hour.tick++) {
    stepTick(hour)
    if (hour.tick % FLUSH_TICKS === 0) await flushLikeTheGame(hour)
  }
  await flushLikeTheGame(hour)
  return { ...hour.bytes, cells: hour.cellsBroken }
}

async function flushLikeTheGame({ runLog, sink }: LoggedHour): Promise<void> {
  runLog.flushDrillSpans()
  await sink.flush()
}

/** Sends `intent` as the player's next command with the domain events `bodies` it caused. */
export function sendCommand(
  hour: LoggedHour,
  intent: CommandIntent,
  bodies: readonly DomainEventBody[],
): void {
  const stamp = { playerId: 'p1', tick: hour.tick, seq: hour.seq++ }
  hour.runLog.recordCommand({ ...stamp, ...intent } as AuthorityCommand)
  const events = bodies.map((body) => ({ ...body, ...stamp }) as DomainEvent)
  recordDomainEventsTo(hour.runLog, PLACE, events)
}

/** The cut events of a tick drilling `metresPerTick` down a column: cells, units, rings. */
export function cutEventsOf(hour: LoggedHour, metresPerTick: number): DomainEventBody[] {
  return [...brokenCells(hour, metresPerTick), ...linedRings(hour, metresPerTick)]
}

/** Forgets the part cell and ring a stopped drill owed, as a new leg starts on fresh ground. */
export function stopCut(hour: LoggedHour): void {
  Object.assign(hour, NO_CUT)
}

/** A cell a metre, as the column is one cell wide. */
function brokenCells(hour: LoggedHour, cellsPerTick: number): DomainEventBody[] {
  hour.cellsOwed += cellsPerTick
  const bodies: DomainEventBody[] = []
  for (; hour.cellsOwed >= 1; hour.cellsOwed -= 1) bodies.push(...cellBodies(hour))
  return bodies
}

function cellBodies(hour: LoggedHour): DomainEventBody[] {
  hour.cellsBroken += 1
  const tile = { tx: 30, ty: hour.cellRow-- }
  const isOre = hour.cellsBroken % ORE_EVERY_CELLS === 0
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

function linedRings(hour: LoggedHour, metresPerTick: number): DomainEventBody[] {
  hour.ringMmOwed += metresPerTick * MM_PER_METRE
  const bodies: DomainEventBody[] = []
  for (; hour.ringMmOwed >= RING_MM; hour.ringMmOwed -= RING_MM) {
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
