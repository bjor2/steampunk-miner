import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Shell } from '../../shell/shell'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { announceWarnings } from '../../store/warningBroadcast'
import type { WarningFiring } from '../../systems/views/warningWatch'
import { keepHapticsPlaying } from './touchFollowers'

// Ticket 685 (design section 7): each ladder tier is felt as a 10, 30 or 60 ms pulse on a phone,
// behind the one haptics setting (#173) that is its off switch.

const buzzes: number[] = []
const shell = { vibrate: (ms: number) => buzzes.push(ms) } as unknown as Shell

const firing = (tier: WarningFiring['tier'], hapticMs: number): WarningFiring => ({
  readoutId: 'fuel',
  tier,
  cueId: `ui.warn.${tier}`,
  hapticMs,
})

beforeAll(() => keepHapticsPlaying(shell))

beforeEach(() => {
  resetGameStore()
  buzzes.length = 0
})

describe('warning haptics (ticket 685)', () => {
  it('buzzes each firing for its tier pulse while haptics are on', () => {
    announceWarnings([firing('low', 10), firing('critical', 30), firing('empty', 60)])
    expect(buzzes).toEqual([10, 30, 60])
  })

  it('stays still with the haptics setting off', () => {
    useGameStore.getState().setPreference('haptics', false)
    announceWarnings([firing('empty', 60)])
    expect(buzzes).toEqual([])
  })
})
