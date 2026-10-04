import { describe, expect, it } from 'vitest'
import { advanceTicks, DIGEST_INTERVAL_TICKS } from './advanceTicks'
import { applyCommand } from './applyCommand'
import { createAuthorityState } from './authorityState'
import { createLoopbackAuthority } from './loopbackAuthority'
import { stateDigest } from './stateDigest'

const freshState = () => createAuthorityState({ planetIndex: 1, planetSeed: 7, playerIds: ['p1'] })

describe('authority clock', () => {
  it('moves the tick forward and changes nothing else', () => {
    const { state } = advanceTicks(freshState(), 600)
    expect(state).toEqual({ ...freshState(), tick: 600 })
  })

  it('takes a periodic digest at every multiple of 3600 ticks it passes', () => {
    const { events } = advanceTicks(freshState(), 3 * DIGEST_INTERVAL_TICKS + 5)
    expect(events.map((event) => event.tick)).toEqual([3600, 7200, 10800])
    expect(events.every((event) => event.type === 'StateDigested')).toBe(true)
  })

  it('digests the state as it stands at that tick', () => {
    const { events } = advanceTicks(freshState(), 3600)
    expect(events).toEqual([
      {
        tick: 3600,
        type: 'StateDigested',
        digest: stateDigest({ ...freshState(), tick: 3600 }),
        scope: 'periodic',
      },
    ])
  })

  it('takes the same digests in one long jump as in many short steps', () => {
    const oneJump = advanceTicks(freshState(), 7200).events
    let state = freshState()
    const steps = []
    for (let tick = 7; tick <= 7200; tick += 7) {
      const outcome = advanceTicks(state, tick)
      state = outcome.state
      steps.push(...outcome.events)
    }
    steps.push(...advanceTicks(state, 7200).events)
    expect(steps).toEqual(oneJump)
  })

  it('does not take the digest of a tick it already stands on twice', () => {
    const at3600 = advanceTicks(freshState(), 3600).state
    expect(advanceTicks(at3600, 3600).events).toEqual([])
  })

  it('refuses to move backwards', () => {
    const later = applyCommand(freshState(), {
      playerId: 'p1',
      tick: 100,
      seq: 1,
      type: 'debug.setPlanet',
      payload: { planetIndex: 2 },
    }).state
    expect(() => advanceTicks(later, 99)).toThrow(RangeError)
  })

  it('tells loopback listeners about the digests before advanceTo returns', () => {
    const authority = createLoopbackAuthority(freshState())
    const heard: string[] = []
    authority.subscribe((events) => heard.push(...events.map((event) => event.type)))
    authority.advanceTo(3600)
    expect(heard).toEqual(['StateDigested'])
    expect(authority.snapshot().tick).toBe(3600)
  })
})
