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
}

export type DomainEventType = keyof DomainEventBodies

export type DomainEventBody = {
  [K in DomainEventType]: { type: K } & DomainEventBodies[K]
}[DomainEventType]

/** Each event carries the `playerId`, `tick` and `seq` of the command that caused it. */
export type DomainEvent = CommandStamp & DomainEventBody
