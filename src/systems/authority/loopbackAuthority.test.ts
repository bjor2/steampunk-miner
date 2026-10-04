import { describe, expect, it } from 'vitest'
import { toCanonical } from '../money'
import type { AuthorityCommand } from './authorityCommand'
import { createAuthorityState } from './authorityState'
import type { DomainEvent } from './domainEvent'
import { createLoopbackAuthority } from './loopbackAuthority'
import { stateDigest } from './stateDigest'

const startState = () => createAuthorityState({ planetIndex: 0, planetSeed: 7, playerIds: ['p1'] })

const grant = (seq: number, amount: string, tick = 0): AuthorityCommand => ({
  playerId: 'p1',
  tick,
  seq,
  type: 'debug.grantMoney',
  payload: { amount },
})

describe('loopback authority', () => {
  it('applies a submitted command and tells listeners before submit returns', () => {
    const authority = createLoopbackAuthority(startState())
    const heard: DomainEvent[] = []
    authority.subscribe((events) => heard.push(...events))
    authority.submit(grant(1, '1e30'))
    expect(heard.map((event) => event.type)).toEqual(['MoneyChanged', 'DebugCommandApplied'])
    expect(toCanonical(authority.snapshot().state.players.p1.wallet)).toBe('1e+30')
  })

  it('stops telling a listener that unsubscribed', () => {
    const authority = createLoopbackAuthority(startState())
    const heard: DomainEvent[] = []
    const stopListening = authority.subscribe((events) => heard.push(...events))
    stopListening()
    authority.submit(grant(1, '5'))
    expect(heard).toEqual([])
  })

  it('reaches the same digest as a fresh authority fed the same commands', () => {
    const commands = [grant(1, '1e30'), grant(2, '3.25', 60), grant(3, '-1', 60), grant(4, '9', 30)]
    const digestAfter = () => {
      const authority = createLoopbackAuthority(startState())
      commands.forEach((command) => authority.submit(command))
      return authority.snapshot()
    }
    const first = digestAfter()
    expect(digestAfter().digest).toBe(first.digest)
    expect(first.digest).toBe(stateDigest(first.state))
    expect(first.tick).toBe(60)
  })

  it('answers a refused command with an event and keeps its state', () => {
    const authority = createLoopbackAuthority(startState())
    const before = authority.snapshot()
    const heard: DomainEvent[] = []
    authority.subscribe((events) => heard.push(...events))
    authority.submit(grant(1, 'lots'))
    expect(heard).toMatchObject([{ type: 'CommandRejected', reason: 'invalid_payload' }])
    expect(authority.snapshot()).toEqual(before)
  })
})
