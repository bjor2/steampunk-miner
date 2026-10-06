import { describe, expect, it } from 'vitest'
import { fromCanonical, toCanonical } from '../money'
import { applyCommand, type CommandOutcome } from './applyCommand'
import type { AuthorityCommand } from './authorityCommand'
import { createAuthorityState, type AuthorityState } from './authorityState'
import type { DomainEvent } from './domainEvent'
import { stateDigest } from './stateDigest'

const freshState = () =>
  createAuthorityState({ planetIndex: 0, planetSeed: 1, playerIds: ['p1', 'p2'] })

function command<T extends AuthorityCommand['type']>(
  type: T,
  payload: Extract<AuthorityCommand, { type: T }>['payload'],
  stamp: { tick?: number; seq: number; playerId?: string },
): AuthorityCommand {
  return { playerId: 'p1', tick: 0, ...stamp, type, payload } as AuthorityCommand
}

/** Folds commands through the authority from a fresh state, as a replay does. */
function replay(commands: readonly AuthorityCommand[]): CommandOutcome {
  return commands.reduce<CommandOutcome>(
    (outcome, next) => {
      const step = applyCommand(outcome.state, next)
      return { state: step.state, events: [...outcome.events, ...step.events] }
    },
    { state: freshState(), events: [] },
  )
}

const walletText = (state: AuthorityState, playerId = 'p1') =>
  toCanonical(state.players[playerId].wallet)

const SESSION: readonly AuthorityCommand[] = [
  command('debug.setPlanet', { planetIndex: 2 }, { seq: 1 }),
  command('debug.setPlanetSeed', { planetSeed: 83921 }, { seq: 2 }),
  command('debug.grantMoney', { amount: '1e30' }, { tick: 60, seq: 3 }),
  command('debug.grantMoney', { amount: '1' }, { tick: 60, seq: 4 }),
  command('debug.grantMoney', { amount: '2.5e39' }, { tick: 120, seq: 5 }),
  command('debug.grantMoney', { amount: '-1' }, { tick: 120, seq: 6 }),
  command('debug.setMoney', { amount: '7' }, { tick: 120, seq: 1, playerId: 'p2' }),
]

describe('authority: determinism', () => {
  it('gives the same digest and events when the same commands are applied twice', () => {
    const first = replay(SESSION)
    const second = replay(SESSION)
    expect(stateDigest(second.state)).toBe(stateDigest(first.state))
    expect(second.events).toEqual(first.events)
  })

  // Re-pinned for #36 (drilling carves density, which the digest covers), protocol 2 (the run
  // starts in the Sell bay, #37), 3 (the casing grade, #41), 4 (each player's held artefact,
  // null here, is authority state, #46), 5 (the casing layer, its grade telegraph and the vehicle's casing trail, #56)
  // and 6 (the list of blocks warning or refilling, empty here, is authority state, #43, #57).
  it('pins the digest of a known session, so a rule change shows up as a decision', () => {
    expect(stateDigest(replay(SESSION).state)).toBe('06db2c4ca5c7c822')
  })

  it('gives a different digest when one command differs', () => {
    const changed = [
      ...SESSION.slice(0, 2),
      command('debug.grantMoney', { amount: '1e30' }, { tick: 61, seq: 3 }),
    ]
    expect(stateDigest(replay(changed).state)).not.toBe(
      stateDigest(replay(SESSION.slice(0, 3)).state),
    )
  })
})

describe('authority: debug commands', () => {
  it('moves the session to another planet and seed', () => {
    const { state } = replay(SESSION.slice(0, 2))
    expect(state.planet).toEqual({ index: 2, seed: 83921 })
  })

  it('adds granted money exactly to all 40 digits', () => {
    const { state } = replay(SESSION.slice(0, 5))
    expect(walletText(state)).toBe('2.500000001000000000000000000000000000001e+39')
  })

  it('replaces a wallet with a scenario amount, for that player only', () => {
    const { state } = replay([
      command('debug.grantMoney', { amount: '5' }, { seq: 1 }),
      command('debug.setMoney', { amount: '1.50' }, { seq: 1, playerId: 'p2' }),
    ])
    expect(walletText(state, 'p1')).toBe('5e+0')
    expect(walletText(state, 'p2')).toBe('1.5e+0')
  })

  it('answers a money command with the wallet before and after', () => {
    const { events } = replay([command('debug.grantMoney', { amount: '1e30' }, { seq: 1 })])
    expect(events[0]).toEqual({
      playerId: 'p1',
      tick: 0,
      seq: 1,
      type: 'MoneyChanged',
      from: '0e+0',
      to: '1e+30',
    })
  })

  it('marks the session as debug-applied and says so after the change', () => {
    const { state, events } = replay([command('debug.setPlanet', { planetIndex: 4 }, { seq: 1 })])
    expect(state.debugApplied).toBe(true)
    expect(events.map((event) => event.type)).toEqual(['PlanetChanged', 'DebugCommandApplied'])
    expect(events[1]).toMatchObject({ command: 'debug.setPlanet', args: { planetIndex: 4 } })
  })

  it('stamps every event with the player, tick and seq of its command', () => {
    const { events } = replay(SESSION)
    const stamps = events.map(({ playerId, tick, seq }: DomainEvent) => [playerId, tick, seq])
    expect(stamps).toContainEqual(['p1', 60, 4])
    expect(stamps).toContainEqual(['p2', 120, 1])
  })

  it('moves the authority tick to the tick of the last accepted command', () => {
    expect(replay(SESSION).state.tick).toBe(120)
  })
})

describe('authority: refused commands', () => {
  function refusalOf(next: unknown, before: readonly AuthorityCommand[] = []) {
    const prior = replay(before)
    const outcome = applyCommand(prior.state, next as AuthorityCommand)
    expect(outcome.state).toBe(prior.state)
    expect(outcome.events).toHaveLength(1)
    return outcome.events[0]
  }

  it('refuses a negative money grant, changing nothing', () => {
    expect(refusalOf(command('debug.grantMoney', { amount: '-1' }, { seq: 1 }))).toMatchObject({
      type: 'CommandRejected',
      commandType: 'debug.grantMoney',
      reason: 'invalid_payload',
    })
  })

  it('lists every payload problem, including unknown fields', () => {
    const next = command('debug.setPlanet', { planetIndex: 1.5, extra: 1 } as never, { seq: 1 })
    expect(refusalOf(next)).toMatchObject({
      problems: [
        'unknown payload field "extra"',
        'planetIndex must be a safe integer >= 0, got 1.5',
      ],
    })
  })

  it('refuses a command type it does not know', () => {
    const next = { playerId: 'p1', tick: 0, seq: 1, type: 'debug.makeRich', payload: {} }
    expect(refusalOf(next)).toMatchObject({
      reason: 'unknown_command',
      commandType: 'debug.makeRich',
    })
  })

  it('refuses a player who is not in the session', () => {
    const next = command('debug.setPlanet', { planetIndex: 1 }, { seq: 1, playerId: 'p9' })
    expect(refusalOf(next)).toMatchObject({ reason: 'unknown_player', playerId: 'p9' })
  })

  it('refuses a command ordered before one it already accepted', () => {
    const before = [command('debug.setPlanet', { planetIndex: 1 }, { tick: 10, seq: 5 })]
    const replayed = command('debug.setPlanet', { planetIndex: 2 }, { tick: 10, seq: 5 })
    const late = command('debug.setPlanet', { planetIndex: 2 }, { tick: 9, seq: 6 })
    expect(refusalOf(replayed, before)).toMatchObject({ reason: 'out_of_order' })
    expect(refusalOf(late, before)).toMatchObject({ reason: 'out_of_order' })
  })

  it('refuses a malformed envelope and still stamps its event with safe integers', () => {
    expect(refusalOf({ playerId: '', tick: 1.5, type: 7 })).toEqual({
      playerId: '',
      tick: 0,
      seq: 0,
      type: 'CommandRejected',
      commandType: '',
      reason: 'malformed_command',
      problems: [
        'playerId must be a non-empty string',
        'tick must be a safe integer >= 0',
        'seq must be a safe integer >= 0',
        'type must be a string',
      ],
    })
  })

  it('refuses a malformed money string', () => {
    const next = command('debug.grantMoney', { amount: '1,000' }, { seq: 1 })
    expect(refusalOf(next)).toMatchObject({ reason: 'invalid_payload' })
  })
})

it('keeps money out of floating point: the wallet is Money, not a number', () => {
  const { state } = replay([command('debug.grantMoney', { amount: '1e30' }, { seq: 1 })])
  expect(state.players.p1.wallet).toEqual(fromCanonical('1e30'))
})
