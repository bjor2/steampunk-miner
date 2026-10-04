/**
 * Authority commands (decision #3): intents, sent as `{ playerId, tick, seq, type, payload }` and
 * replayed from `commands.ndjson`, so every field is plain JSON (money as decimal strings).
 * Commands are ordered by `(tick, seq)`; `tick` is the fixed 1/60 s step, never wall-clock.
 *
 * Debug and scenario commands are the `debug.*` types (#11 section 4); `isDebugCommandType`
 * marks them instead of a separate flag that could disagree with the type.
 */

/** Bump when a command or domain event changes shape or meaning; run metadata records it. */
export const AUTHORITY_PROTOCOL_VERSION = 1

export interface CommandPayloads {
  'debug.setPlanet': { planetIndex: number }
  'debug.setPlanetSeed': { planetSeed: number }
  /** Adds `amount` (a decimal string) to the player's wallet. */
  'debug.grantMoney': { amount: string }
  /** Replaces the player's wallet with `amount` (a start scenario's money). */
  'debug.setMoney': { amount: string }
}

export type CommandType = keyof CommandPayloads

/** Who sent a command and where it sits in the `(tick, seq)` order; domain events carry it too. */
export interface CommandStamp {
  playerId: string
  tick: number
  /** Strictly increasing per player. */
  seq: number
}

/** What a caller wants done; the sender adds the stamp when it submits. */
export type CommandIntent<T extends CommandType = CommandType> = {
  [K in T]: { type: K; payload: CommandPayloads[K] }
}[T]

export type AuthorityCommand<T extends CommandType = CommandType> = CommandStamp & CommandIntent<T>

export function isDebugCommandType(type: CommandType): boolean {
  return type.startsWith('debug.')
}
