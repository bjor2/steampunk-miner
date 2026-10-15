/**
 * The run log's drill span writer (ticket 420, the TD spec on #396 section 1): it holds each
 * player's open span across command batches and writes its `drill_cut` line, and its
 * `casing_lined` line, when the span closes. A span closes on a carry stop or another command
 * with events (`domainEventLog.ts` says which), when the next event is in another band or lining
 * run or past the 5 s cap (`drillCutLine.ts`), when the player's next drill command starts more
 * than 30 ticks after the last one ended, and at every flush. Nothing is dropped: a span only
 * decides when its line is written.
 */
import { DRILL_SPAN_IDLE_TICKS } from '../constants/runLog'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import type { RunEventData } from './eventNames'
import {
  casingLinedLineOf,
  drillCutDataOf,
  drillCutStampOf,
  foldIntoSpan,
  openDrillSpan,
  spanBreakOf,
  type DrillSpan,
  type DrillSpanStop,
  type SpanEvent,
  type SpanReading,
} from './drillCutLine'
import type { RunEventStamp } from './runEvent'

export type DrillSpanLine =
  | { event: 'drill_cut'; data: RunEventData<'drill_cut'> }
  | { event: 'casing_lined'; data: RunEventData<'casing_lined'> }

export type WriteDrillSpanLine = (stamp: RunEventStamp, line: DrillSpanLine) => void

export interface DrillSpanWriter {
  /** A submitted command; a drill command starting over 30 ticks after the last ends the span. */
  noteCommand(command: AuthorityCommand): void
  /** Adds an event a drill command caused to its player's span, `reading` the vehicle after it. */
  fold(next: SpanEvent, reading: SpanReading | null): void
  /** The player's vehicle after a batch: the opening reading of their next span. */
  noteReading(playerId: string, reading: SpanReading | null): void
  close(playerId: string, stop: DrillSpanStop): void
  closeAll(stop: DrillSpanStop): void
}

/** The ticks a drill command drilled: from its first to the tick it was sent. */
interface DrillWindow {
  from: number
  to: number
}

export function createDrillSpanWriter(write: WriteDrillSpanLine): DrillSpanWriter {
  const spans = new Map<string, DrillSpan>()
  const lastDrillEnds = new Map<string, number>()
  const readings = new Map<string, SpanReading | null>()

  const close = (playerId: string, stop: DrillSpanStop): void => {
    const span = spans.get(playerId)
    if (span === undefined) return
    spans.delete(playerId)
    writeSpanLines(write, span, stop)
  }

  const closeIfIdle = (playerId: string, window: DrillWindow): void => {
    const lastEnd = lastDrillEnds.get(playerId)
    if (lastEnd !== undefined && window.from - lastEnd > DRILL_SPAN_IDLE_TICKS) {
      close(playerId, 'idle')
    }
  }

  const openSpanOf = (next: SpanEvent): DrillSpan => {
    const span = openDrillSpan(next, readings.get(next.event.playerId) ?? null)
    spans.set(next.event.playerId, span)
    return span
  }

  return {
    noteCommand: (command) => {
      const window = drillWindowOf(command)
      if (window === null) return
      closeIfIdle(command.playerId, window)
      lastDrillEnds.set(command.playerId, window.to)
    },
    fold: (next, reading) => {
      const open = spans.get(next.event.playerId)
      const stop = open === undefined ? null : spanBreakOf(open, next)
      if (stop !== null) close(next.event.playerId, stop)
      const span = spans.get(next.event.playerId) ?? openSpanOf(next)
      foldIntoSpan(span, next)
      span.closing = reading
    },
    noteReading: (playerId, reading) => void readings.set(playerId, reading),
    close,
    closeAll: (stop) => [...spans.keys()].forEach((playerId) => close(playerId, stop)),
  }
}

function writeSpanLines(write: WriteDrillSpanLine, span: DrillSpan, stop: DrillSpanStop): void {
  write(drillCutStampOf(span), { event: 'drill_cut', data: drillCutDataOf(span, stop) })
  if (span.lining === null) return
  const lined = casingLinedLineOf(span.lining)
  write(lined.stamp, { event: 'casing_lined', data: lined.data })
}

/**
 * A `drillTile` and a pose's drill ticks count back from the tick they are sent (#11 amendment
 * 2), a `drillStep` is its own tick; any other command drills nothing.
 */
function drillWindowOf(command: AuthorityCommand): DrillWindow | null {
  if (command.type === 'drillTile') return windowBackFrom(command.tick, command.payload.ticks)
  if (command.type === 'drillStep') return windowBackFrom(command.tick, 0)
  if (command.type !== 'reportPose' || command.payload.drillTicks === 0) return null
  return windowBackFrom(command.tick, command.payload.drillTicks)
}

function windowBackFrom(tick: number, ticks: number): DrillWindow {
  return { from: tick - ticks, to: tick }
}
