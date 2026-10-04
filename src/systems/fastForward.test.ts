import { describe, expect, it } from 'vitest'
import { fastForwardProblems, fastForwardSteps, type ScriptedCommand } from './fastForward'

const grantAt = (tick: number): ScriptedCommand => ({
  tick,
  type: 'debug.grantMoney',
  payload: { amount: '1e+0' },
})

describe('fast-forward plan', () => {
  it('advances to each scripted command, submits it, and ends ticks after the start', () => {
    expect(fastForwardSteps(100, 600, [grantAt(160), grantAt(160)])).toEqual([
      { kind: 'advance', tick: 160 },
      { kind: 'submit', intent: { type: 'debug.grantMoney', payload: { amount: '1e+0' } } },
      { kind: 'advance', tick: 160 },
      { kind: 'submit', intent: { type: 'debug.grantMoney', payload: { amount: '1e+0' } } },
      { kind: 'advance', tick: 700 },
    ])
  })

  it('is only the final advance when nothing is scripted', () => {
    expect(fastForwardSteps(0, 3600, [])).toEqual([{ kind: 'advance', tick: 3600 }])
  })

  it('refuses a negative or fractional tick count', () => {
    expect(fastForwardProblems(0, -1, [])).toHaveLength(1)
    expect(fastForwardProblems(0, 1.5, [])).toHaveLength(1)
  })

  it('refuses commands outside the window or out of order, listing each', () => {
    expect(
      fastForwardProblems(100, 600, [grantAt(50), grantAt(800), grantAt(300), grantAt(200)]),
    ).toEqual([
      'commands[0].tick must be from 100 to 700, got 50',
      'commands[1].tick must be from 100 to 700, got 800',
      'commands[2].tick is before the command above it',
      'commands[3].tick is before the command above it',
    ])
  })
})
