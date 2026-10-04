/**
 * One line of a run's event log (design doc section 21). Append-only during play.
 * Differences from the doc's example: `seq` (a strictly increasing counter, so order survives
 * equal timestamps) and `timestamp` is seconds since the run started.
 */
import type { RunEventName } from './eventNames'

/** Where in the world an event happened; the store supplies it, the log stamps it. */
export interface RunEventContext {
  playerId: string
  planet: number
  planetSeed: number
  /** Fraction of the way from the surface (0) to the core (1). */
  depth: number
}

/** Free-form payload for events whose fields the design has not pinned down yet. */
export type UnspecifiedEventData = Readonly<Record<string, unknown>>

/** Payloads we have specified. Every other name uses UnspecifiedEventData until it is. */
export interface SpecifiedEventData {
  game_started: { gameVersion: string; buildCommit: string; platform: 'electron' | 'browser' }
  game_ended: { durationSeconds: number }
  resource_collected: { resourceTier: number; amount: number; value: number }
  debug_command_applied: { command: string; args: UnspecifiedEventData }
}

export type RunEventData<N extends RunEventName> = N extends keyof SpecifiedEventData
  ? SpecifiedEventData[N]
  : UnspecifiedEventData

export interface RunEvent<N extends RunEventName = RunEventName> extends RunEventContext {
  seq: number
  /** Seconds since the run started. */
  timestamp: number
  runId: string
  event: N
  data: RunEventData<N>
}
