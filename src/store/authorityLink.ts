/**
 * The store's one connection to the authority (decision #3). Store actions that change the world
 * or the economy hand an intent to `submitCommand`; this module stamps it with the player, the
 * tick and the next `seq`, and the store renders what the answering events say.
 *
 * `tick` is the authority's current tick until a fixed-step tick counter drives commands (it
 * arrives with the first tick-driven command, `reportPose`).
 */
import { getRunLog } from '../logging/runLog'
import type { AuthorityCommand, CommandIntent } from '../systems/authority/authorityCommand'
import { applyCommand } from '../systems/authority/applyCommand'
import type { AuthorityState } from '../systems/authority/authorityState'
import type { Authority, DomainEventListener } from '../systems/authority/loopbackAuthority'

let authority: Authority | null = null
let nextSeq = 1
let stopListening = () => {}

/** A restored session continues its `seq`s, so the authority keeps accepting our commands. */
export function connectAuthority(next: Authority, onEvents: DomainEventListener): void {
  stopListening()
  authority = next
  nextSeq = highestAcceptedSeq(next.readState()) + 1
  stopListening = next.subscribe(onEvents)
}

function highestAcceptedSeq(state: AuthorityState): number {
  return Math.max(0, ...Object.values(state.players).map((player) => player.lastSeq))
}

/** Every submitted command, accepted or not, goes to `commands.ndjson`: it replays the same way. */
export function submitCommand(playerId: string, intent: CommandIntent): void {
  const command = stampCommand(playerId, intent)
  getRunLog().recordCommand(command)
  connectedAuthority().submit(command)
}

function stampCommand(playerId: string, intent: CommandIntent): AuthorityCommand {
  return { playerId, tick: connectedAuthority().readState().tick, seq: nextSeq++, ...intent }
}

/**
 * What the authority would refuse this intent for, if it were submitted now: a dry run of the pure
 * `applyCommand` on the current state, so a refused debug call changes nothing and logs nothing.
 */
export function refusalOf(playerId: string, intent: CommandIntent): string[] {
  const state = connectedAuthority().readState()
  const command = { playerId, tick: state.tick, seq: nextSeq, ...intent } as AuthorityCommand
  const refusal = applyCommand(state, command).events.find(
    (event) => event.type === 'CommandRejected' && event.seq === command.seq,
  )
  return refusal?.type === 'CommandRejected' ? refusal.problems : []
}

/** Moves the authority's clock with no command (fastForward); it answers with its events. */
export function advanceAuthorityTo(tick: number): void {
  connectedAuthority().advanceTo(tick)
}

/** The authority's state now, without the digest a snapshot computes (#101). */
export function readAuthorityState(): AuthorityState {
  return connectedAuthority().readState()
}

function connectedAuthority(): Authority {
  if (authority === null) throw new Error('the game store is not connected to an authority')
  return authority
}

/** A debug command the authority would refuse is not sent: it throws with the problems. */
export function submitUnlessRefused(playerId: string, intent: CommandIntent): void {
  refuseProblems(refusalOf(playerId, intent))
  submitCommand(playerId, intent)
}

/** A scenario is refused, never trimmed: every problem is named, nothing is applied. */
export function refuseProblems(problems: string[]): void {
  if (problems.length > 0) throw new Error(problems.join('; '))
}
