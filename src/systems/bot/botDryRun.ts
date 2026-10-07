import type { CommandIntent } from '../authority/authorityCommand'
import { applyCommand } from '../authority/applyCommand'
import type { BotSession } from './botSession'

/** A dry run of the pure authority: the bot never sends a command it knows will be refused. */
export function wouldAccept(session: BotSession, intent: CommandIntent): boolean {
  const state = session.state()
  const seq = state.players[session.playerId].lastSeq + 1
  const command = { playerId: session.playerId, tick: state.tick, seq, ...intent }
  return applyCommand(state, command as never).events.every(
    (event) => event.type !== 'CommandRejected',
  )
}
