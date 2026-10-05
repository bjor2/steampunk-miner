/**
 * The authority (decision #3): `applyCommand(state, command) -> { state, events }`, pure and
 * headless, the only way world and economy state changes. Local play, replay, scenarios and a
 * future co-op host all run exactly this function.
 *
 * Commands may arrive from a replayed file, so the envelope and payload are checked at runtime.
 * A refused command changes nothing and answers with one `CommandRejected` event, which replays
 * identically.
 *
 * Before a command is looked at, the clock's own changes up to its tick happen first (enemy ticks,
 * a tow whose grace ran out), so a command never acts on a vehicle the clock has already moved.
 * A refused command keeps the state from before them; the next clock move runs them again.
 */
import {
  isDebugCommandType,
  type AuthorityCommand,
  type CommandIntent,
  type CommandStamp,
  type CommandType,
} from './authorityCommand'
import { ARTEFACT_RULES } from './artefactRules'
import { settleClockTo } from './authorityClock'
import type { AuthorityState } from './authorityState'
import { rejectionOf, type CommandRule, type Rejection, type RuleEffect } from './commandRule'
import { CASING_RULES } from './casingRules'
import { DEBUG_COMMAND_RULES } from './debugCommandRules'
import { DOCK_COMMAND_RULES } from './dockRules'
import type { DomainEvent, DomainEventBody } from './domainEvent'
import { isJsonObject, isWholeNumber, payloadProblems } from './payloadFields'
import { PLATFORM_SERVICE_RULES } from './platformServices'
import { VEHICLE_COMMAND_RULES } from './vehicleCommandRules'
import { TRAVEL_RULES } from './travelRules'
import { WORKSHOP_RULES } from './workshopRules'

export interface CommandOutcome {
  state: AuthorityState
  events: DomainEvent[]
}

export function applyCommand(state: AuthorityState, command: AuthorityCommand): CommandOutcome {
  const clocked = runClockUpTo(state, command)
  const rejection = findRejection(clocked.state, command)
  if (rejection !== null) return rejectCommand(state, command, rejection)
  const answer = acceptCommand(clocked.state, command)
  return { state: answer.state, events: [...clocked.events, ...answer.events] }
}

/**
 * Why the authority would refuse this intent from this player now, without applying it: the
 * platform screen's disabled buttons carry exactly this reason (#33 section 6), and the clock is
 * not moved, since a screen asks about the tick it shows.
 */
export function refusalOfIntent(
  state: AuthorityState,
  playerId: string,
  intent: CommandIntent,
): Rejection | null {
  const seq = (state.players[playerId]?.lastSeq ?? 0) + 1
  return findRejection(state, { playerId, tick: state.tick, seq, ...intent })
}

const COMMAND_RULES: Readonly<Record<string, CommandRule<CommandType>>> = {
  ...DEBUG_COMMAND_RULES,
  ...VEHICLE_COMMAND_RULES,
  ...DOCK_COMMAND_RULES,
  ...PLATFORM_SERVICE_RULES,
  ...WORKSHOP_RULES,
  ...CASING_RULES,
  ...TRAVEL_RULES,
  ...ARTEFACT_RULES,
}

/** The tick-driven changes due by a well-formed command's tick; none for a malformed one. */
function runClockUpTo(state: AuthorityState, command: unknown): CommandOutcome {
  const tick = isJsonObject(command) ? command.tick : undefined
  if (!isWholeNumber(tick) || (tick as number) < state.tick) return { state, events: [] }
  return settleClockTo(state, tick as number)
}

type RejectionCheck = (state: AuthorityState, command: unknown) => Rejection | null

/** In order: each check may assume the ones before it passed. */
const REJECTION_CHECKS: readonly RejectionCheck[] = [
  envelopeRejection,
  commandTypeRejection,
  playerRejection,
  orderRejection,
  payloadRejection,
  ruleRejection,
]

function findRejection(state: AuthorityState, command: unknown): Rejection | null {
  for (const check of REJECTION_CHECKS) {
    const rejection = check(state, command)
    if (rejection !== null) return rejection
  }
  return null
}

function envelopeRejection(_state: AuthorityState, command: unknown): Rejection | null {
  if (!isJsonObject(command)) return rejectionOf('malformed_command', 'command must be an object')
  const problems = [
    ...(isNonEmptyString(command.playerId) ? [] : ['playerId must be a non-empty string']),
    ...(isWholeNumber(command.tick) ? [] : ['tick must be a safe integer >= 0']),
    ...(isWholeNumber(command.seq) ? [] : ['seq must be a safe integer >= 0']),
    ...(typeof command.type === 'string' ? [] : ['type must be a string']),
  ]
  return problems.length > 0 ? { reason: 'malformed_command', problems } : null
}

function commandTypeRejection(_state: AuthorityState, command: unknown): Rejection | null {
  const { type } = command as AuthorityCommand
  if (Object.hasOwn(COMMAND_RULES, type)) return null
  return rejectionOf('unknown_command', `unknown command type "${type}"`)
}

function playerRejection(state: AuthorityState, command: unknown): Rejection | null {
  const { playerId } = command as AuthorityCommand
  if (Object.hasOwn(state.players, playerId)) return null
  return rejectionOf('unknown_player', `unknown player "${playerId}"`)
}

function orderRejection(state: AuthorityState, command: unknown): Rejection | null {
  const { playerId, tick, seq } = command as AuthorityCommand
  const lastSeq = state.players[playerId].lastSeq
  const problems = [
    ...(tick >= state.tick ? [] : [`tick ${tick} is before the authority tick ${state.tick}`]),
    ...(seq > lastSeq ? [] : [`seq ${seq} is not after the last accepted seq ${lastSeq}`]),
  ]
  return problems.length > 0 ? { reason: 'out_of_order', problems } : null
}

function payloadRejection(_state: AuthorityState, command: unknown): Rejection | null {
  const { type, payload } = command as AuthorityCommand
  const problems = payloadProblems(payload, COMMAND_RULES[type].fields)
  return problems.length > 0 ? { reason: 'invalid_payload', problems } : null
}

function ruleRejection(state: AuthorityState, command: unknown): Rejection | null {
  const typed = command as AuthorityCommand
  return COMMAND_RULES[typed.type].reject?.(state, typed) ?? null
}

function acceptCommand(state: AuthorityState, command: AuthorityCommand): CommandOutcome {
  const receipted = recordReceipt(state, command)
  const effect = applyRule(receipted, command)
  return {
    state: effect.state,
    events: stampEvents(command, [...effect.events, ...debugTrailOf(command)]),
  }
}

/** Every accepted command moves the authority to its tick and spends its seq. */
function recordReceipt(state: AuthorityState, command: AuthorityCommand): AuthorityState {
  const player = state.players[command.playerId]
  return {
    ...state,
    tick: command.tick,
    players: { ...state.players, [command.playerId]: { ...player, lastSeq: command.seq } },
    debugApplied: state.debugApplied || isDebugCommandType(command.type),
  }
}

function applyRule(state: AuthorityState, command: AuthorityCommand): RuleEffect {
  return COMMAND_RULES[command.type].apply(state, command)
}

/** Scenario and debug commands say so in the log, so analytics never count them as play. */
function debugTrailOf(command: AuthorityCommand): DomainEventBody[] {
  if (!isDebugCommandType(command.type)) return []
  return [{ type: 'DebugCommandApplied', command: command.type, args: { ...command.payload } }]
}

function stampEvents(command: AuthorityCommand, bodies: DomainEventBody[]): DomainEvent[] {
  const stamp: CommandStamp = { playerId: command.playerId, tick: command.tick, seq: command.seq }
  return bodies.map((body) => ({ ...stamp, ...body }))
}

function rejectCommand(
  state: AuthorityState,
  command: unknown,
  rejection: Rejection,
): CommandOutcome {
  const fields = isJsonObject(command) ? command : {}
  const event: DomainEvent = {
    ...stampOfAnyCommand(state, fields),
    type: 'CommandRejected',
    commandType: typeof fields.type === 'string' ? fields.type : '',
    ...rejection,
  }
  return { state, events: [event] }
}

/** A refused command may be malformed; its event still carries a valid stamp. */
function stampOfAnyCommand(state: AuthorityState, fields: Record<string, unknown>): CommandStamp {
  return {
    playerId: isNonEmptyString(fields.playerId) ? fields.playerId : '',
    tick: isWholeNumber(fields.tick) ? (fields.tick as number) : state.tick,
    seq: isWholeNumber(fields.seq) ? (fields.seq as number) : 0,
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
