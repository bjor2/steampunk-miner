/**
 * Domain events (decision #3): facts the authority answers a command with, in order. They are
 * the replication unit and the source the run log is projected from (#11), so every field is
 * plain JSON and money is a canonical string.
 */
import type { CommandStamp, CommandType } from './authorityCommand'

/** Why a command changed nothing (#11 amendment 2: `command_rejected {type, reason}`). */
export type RejectionReason =
  'malformed_command' | 'unknown_command' | 'unknown_player' | 'out_of_order' | 'invalid_payload'

export interface DomainEventBodies {
  PlanetChanged: { planetIndex: number }
  PlanetSeedChanged: { planetSeed: number }
  MoneyChanged: { from: string; to: string }
  DebugCommandApplied: { command: CommandType; args: Readonly<Record<string, unknown>> }
  CommandRejected: { commandType: string; reason: RejectionReason; problems: string[] }
  StateDigested: { digest: string; scope: DigestScope }
}

/** When a digest is taken (#11 section 3): every 3600 ticks, at docks and travel, at the end. */
export type DigestScope = 'periodic' | 'dock' | 'travel' | 'end'

export type DomainEventType = keyof DomainEventBodies

export type DomainEventBody = {
  [K in DomainEventType]: { type: K } & DomainEventBodies[K]
}[DomainEventType]

/** An event the clock caused, not a command (a periodic digest): it has no player or seq. */
export interface TickStamp {
  tick: number
  playerId?: undefined
  seq?: undefined
}

/**
 * A command-caused event carries the `playerId`, `tick` and `seq` of its command; a tick-driven
 * one only the tick (#11: its log line has no `cmd`).
 */
export type DomainEvent = (CommandStamp | TickStamp) & DomainEventBody

export function isCommandCaused(event: DomainEvent): event is CommandStamp & DomainEventBody {
  return event.seq !== undefined
}
