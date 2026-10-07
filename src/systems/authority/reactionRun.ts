/**
 * Runs the slices' authority reactions (`registries/authorityReactions.ts`, #219) over the answer
 * of one accepted command or one settled clock tick: for each player whose events the step raised,
 * in the order the players first appear, every reaction in id order. A reaction's events take the
 * stamp of the last event it heard, so a command's reaction events carry the command's stamp and a
 * tick's carry the tick and the player. With no reaction registered the answer is returned as is.
 */
import { authorityReactions, type AuthorityReaction } from '../registries/authorityReactions'
import type { CommandOutcome } from './applyCommand'
import type { CommandStamp } from './authorityCommand'
import type { AuthorityState } from './authorityState'
import {
  isCommandCaused,
  type DomainEvent,
  type DomainEventBody,
  type TickStamp,
} from './domainEvent'

export function reactToStep(before: AuthorityState, answer: CommandOutcome): CommandOutcome {
  const reactions = authorityReactions()
  if (reactions.length === 0) return answer
  return eventsByPlayer(answer.events).reduce(
    (current, heard) => reactToPlayerEvents(before, current, heard, reactions),
    answer,
  )
}

/** Each group holds one player's events (or the playerless ones), in the order they came. */
function eventsByPlayer(events: readonly DomainEvent[]): DomainEvent[][] {
  const groups = new Map<string | undefined, DomainEvent[]>()
  for (const event of events) {
    const group = groups.get(event.playerId)
    if (group === undefined) groups.set(event.playerId, [event])
    else group.push(event)
  }
  return [...groups.values()]
}

function reactToPlayerEvents(
  before: AuthorityState,
  answer: CommandOutcome,
  heard: readonly DomainEvent[],
  reactions: readonly AuthorityReaction[],
): CommandOutcome {
  const stamp = stampOf(heard[heard.length - 1])
  return reactions.reduce<CommandOutcome>((current, reaction) => {
    const effect = reaction.react(before, current.state, heard)
    return {
      state: effect.state,
      events: [...current.events, ...stampedWith(stamp, effect.events)],
    }
  }, answer)
}

/** The stamp alone, with no key left `undefined`, since the canonical JSON refuses one. */
function stampOf(event: DomainEvent): CommandStamp | TickStamp {
  if (isCommandCaused(event)) return { playerId: event.playerId, tick: event.tick, seq: event.seq }
  if (event.playerId === undefined) return { tick: event.tick }
  return { tick: event.tick, playerId: event.playerId }
}

function stampedWith(stamp: CommandStamp | TickStamp, bodies: DomainEventBody[]): DomainEvent[] {
  return bodies.map((body): DomainEvent => ({ ...stamp, ...body }))
}
