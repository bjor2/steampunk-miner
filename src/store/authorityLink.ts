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
import type { AuthorityState } from '../systems/authority/authorityState'
import type { Authority, DomainEventListener } from '../systems/authority/loopbackAuthority'

let authority: Authority | null = null
let nextSeq = 1
let stopListening = () => {}

export function connectAuthority(next: Authority, onEvents: DomainEventListener): void {
  stopListening()
  authority = next
  nextSeq = 1
  stopListening = next.subscribe(onEvents)
}

/** Every submitted command, accepted or not, goes to `commands.ndjson`: it replays the same way. */
export function submitCommand(playerId: string, intent: CommandIntent): void {
  const command = stampCommand(playerId, intent)
  getRunLog().recordCommand(command)
  connectedAuthority().submit(command)
}

function stampCommand(playerId: string, intent: CommandIntent): AuthorityCommand {
  return { playerId, tick: connectedAuthority().snapshot().tick, seq: nextSeq++, ...intent }
}

export function readAuthorityState(): AuthorityState {
  return connectedAuthority().snapshot().state
}

function connectedAuthority(): Authority {
  if (authority === null) throw new Error('the game store is not connected to an authority')
  return authority
}
