/**
 * The bot's headless session (#29, #11 section 5 `fastForward`): one player's commands, stamped
 * and applied through `applyCommand` at the bot's tick, the clock moved with `advanceTicks`, every
 * command and domain event kept. It is the same pairing `replayRun` uses, so the command list it
 * records replays to the same digests.
 */
import { advanceTicks } from '../authority/advanceTicks'
import { applyCommand, type CommandOutcome } from '../authority/applyCommand'
import type { AuthorityCommand, CommandIntent } from '../authority/authorityCommand'
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import type { VehicleState } from '../vehicle/vehicleState'

export interface BotSession {
  readonly playerId: string
  state(): AuthorityState
  vehicle(): VehicleState
  tick(): number
  /** Submits at the current tick; answers the command's events. */
  submit(intent: CommandIntent): readonly DomainEvent[]
  /** Moves the clock `ticks` forward with no command. */
  wait(ticks: number): void
  commands(): readonly AuthorityCommand[]
  events(): readonly DomainEvent[]
}

export function createBotSession(start: AuthorityState, playerId: string): BotSession {
  let state = start
  let nextSeq = start.players[playerId].lastSeq + 1
  const commands: AuthorityCommand[] = []
  const events: DomainEvent[] = []
  const keep = (outcome: CommandOutcome): readonly DomainEvent[] => {
    state = outcome.state
    events.push(...outcome.events)
    return outcome.events
  }
  return {
    playerId,
    state: () => state,
    vehicle: () => vehicleOf(state, playerId),
    tick: () => state.tick,
    submit(intent) {
      const command = { playerId, tick: state.tick, seq: nextSeq++, ...intent } as AuthorityCommand
      commands.push(command)
      return keep(applyCommand(state, command))
    },
    wait(ticks) {
      if (ticks > 0) keep(advanceTicks(state, state.tick + ticks))
    },
    commands: () => commands,
    events: () => events,
  }
}
