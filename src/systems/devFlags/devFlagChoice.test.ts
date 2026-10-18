import { describe, expect, it } from 'vitest'
import { DEV_FLAGS } from '../../constants/devFlags'
import { createAuthorityState } from '../authority/authorityState'
import {
  authorityPartOf,
  clientPartOf,
  devFlagChoiceProblems,
  setFlagsDeltaOf,
} from './devFlagChoice'

// A choice of dev flags (ticket 548): flags only, split between the client loop and one logged
// `debug.setFlags`, and what a session start sends for the remembered overrides.

const DEFAULT = createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })

describe('a dev flag choice', () => {
  it('accepts client and authority flags with booleans', () => {
    expect(devFlagChoiceProblems({ 'drill.sweptCut': false, 'heat.workUncapped': false })).toEqual(
      [],
    )
  })

  it('refuses unknown ids and numbers whole, every problem named', () => {
    expect(devFlagChoiceProblems({ 'drill.tickFloor': true, 'drill.exactCarry': 1.12 })).toEqual([
      '"drill.tickFloor" is not a dev flag',
      '"drill.exactCarry" must be true or false',
    ])
    expect(devFlagChoiceProblems(null)).toHaveLength(1)
  })

  it('splits the choice between the client loop and the authority', () => {
    const choice = { 'drill.reportEveryTick': false, 'enemy.lureRetarget': false }
    expect(clientPartOf(choice)).toEqual({ 'drill.reportEveryTick': false })
    expect(authorityPartOf(choice)).toEqual({ 'enemy.lureRetarget': false })
  })
})

describe('the debug.setFlags a choice sends', () => {
  const sent = (choice: object, state = DEFAULT, client = DEV_FLAGS) =>
    setFlagsDeltaOf(choice, state, client)

  it('sends nothing with no override, so a default session start digests as before', () => {
    expect(sent({})).toBeNull()
  })

  it('sends nothing for flags chosen at the values they run at', () => {
    expect(sent({ 'drill.sweptCut': true, 'drill.exactCarry': true })).toBeNull()
  })

  it('sends the authority flags the choice changes, and only those', () => {
    expect(sent({ 'drill.exactCarry': false, 'heat.workUncapped': true })).toEqual({
      'drill.exactCarry': false,
    })
  })

  it('sends an empty delta for a client-only change, so the run carries the taint', () => {
    expect(sent({ 'drill.sweptCut': false })).toEqual({})
  })

  it('sends nothing again to a session already marked and running the choice', () => {
    const running = {
      ...DEFAULT,
      devFlagDelta: { 'drill.exactCarry': false },
      devFlagsEverSet: true as const,
    }
    expect(sent({ 'drill.exactCarry': false, 'drill.sweptCut': false }, running)).toBeNull()
    expect(sent({ 'heat.workUncapped': false }, running)).toEqual({ 'heat.workUncapped': false })
  })
})
