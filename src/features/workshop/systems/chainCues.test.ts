import { describe, expect, it } from 'vitest'
import { momentOf, stopCueOf } from './chainCues'
import {
  landStep,
  leaveHoldFocus,
  pressHoldChain,
  refuseStep,
  releaseHoldChain,
  type HoldChain,
} from './holdChain'

const held = (): HoldChain => landStep(pressHoldChain(0), 0, 'pip')

describe('workshop chain cues', () => {
  it('gives an ordinary major in a live chain the compressed moment', () => {
    const chain = landStep(held(), 18, 'major')

    expect(momentOf('major', chain)).toBe('compressed')
  })

  it('gives a major the full moment once the chain has ended on it', () => {
    const chain = releaseHoldChain(landStep(pressHoldChain(0), 0, 'major'))

    expect(momentOf('major', chain)).toBe('full')
  })

  it('gives pips their quick reaction and milestones their own moment', () => {
    expect(momentOf('pip', held())).toBe('pip')
    expect(momentOf('milestone', landStep(held(), 18, 'milestone'))).toBe('milestone')
  })

  it('ends a released or unfocused chain on the ka-chunk cadence', () => {
    expect(stopCueOf(releaseHoldChain(held()))).toBe('ka_chunk')
    expect(stopCueOf(leaveHoldFocus(held()))).toBe('ka_chunk')
  })

  it('ends a refused chain on the cue of its reason', () => {
    expect(stopCueOf(refuseStep(held(), 'money_short'))).toBe('empty_clunk')
    expect(stopCueOf(refuseStep(held(), 'max_level'))).toBe('max_stamp')
    expect(stopCueOf(refuseStep(held(), 'not_docked'))).toBe('ka_chunk')
  })

  it('plays no stop cue while the chain is live', () => {
    expect(stopCueOf(held())).toBeNull()
  })
})
