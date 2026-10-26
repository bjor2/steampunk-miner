import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { readRackSight } from './rackSightReads'

// The rack reads what the local rig carries (D7 #866): its sticks grow with the Blast Radius level
// the rig owns (D9 #869), set here through the store's debug action as a scenario sets it.

const game = () => useGameStore.getState()

beforeEach(() => resetGameStore())

describe('dynamite-visuals: the rack sight', () => {
  it('reads level 0 on a rig that owns no Blast Radius level', () => {
    expect(readRackSight().radiusLevel).toBe(0)
  })

  it('reads the Blast Radius level the rig owns, the one its blasts read', () => {
    game().setCharges(2, 0, 1)
    game().setBlastRadiusLevel(10)
    expect(readRackSight()).toMatchObject({ isRackMounted: true, radiusLevel: 10 })
  })
})
