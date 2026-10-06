import { describe, expect, it } from 'vitest'
import { createHeapWatch, takeHeapStepReached } from './heapThreshold'

const STEP_KB = 51_200

/** Feeds the readings in order and returns what each one was due. */
function stepsDueOver(readingsKB: number[]): number[] {
  const watch = createHeapWatch(STEP_KB)
  return readingsKB.map((usedKB) => takeHeapStepReached(watch, usedKB))
}

describe('heap snapshot threshold', () => {
  it('takes the first reading as the start and is due nothing for it', () => {
    expect(stepsDueOver([400_000])).toEqual([0])
  })

  it('is not due while the heap stays under one step above the start', () => {
    expect(stepsDueOver([40_000, 60_000, 91_199])).toEqual([0, 0, 0])
  })

  it('is due the first step when the heap climbs a whole step above the start', () => {
    expect(stepsDueOver([40_000, 91_200])).toEqual([0, 1])
  })

  it('is due once per step, not again while the heap stays past it', () => {
    expect(stepsDueOver([40_000, 95_000, 99_000, 142_400])).toEqual([0, 1, 0, 2])
  })

  it('does not take a step twice when the heap falls back under it and climbs again', () => {
    expect(stepsDueOver([40_000, 95_000, 80_000, 95_000])).toEqual([0, 1, 0, 0])
  })

  it('takes one snapshot for a jump past several steps, numbered by the highest', () => {
    expect(stepsDueOver([40_000, 200_000, 210_000])).toEqual([0, 3, 0])
  })

  it('is due nothing for a heap below its start', () => {
    expect(stepsDueOver([90_000, 20_000])).toEqual([0, 0])
  })
})
