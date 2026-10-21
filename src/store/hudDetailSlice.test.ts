import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from './gameStore'

const game = () => useGameStore.getState()

beforeEach(() => resetGameStore())

describe('HUD detail (ticket 684)', () => {
  it('starts closed', () => {
    expect(game().isHudDetailOpen).toBe(false)
  })

  it('opens on a gear press and closes on the next', () => {
    game().toggleHudDetail()
    expect(game().isHudDetailOpen).toBe(true)
    game().toggleHudDetail()
    expect(game().isHudDetailOpen).toBe(false)
  })

  it('closes from open and stays closed when closed again', () => {
    game().toggleHudDetail()
    game().closeHudDetail()
    game().closeHudDetail()
    expect(game().isHudDetailOpen).toBe(false)
  })

  it('changes nothing the authority holds and does not hold play', () => {
    const before = { money: game().money, vehicle: game().vehicle, hold: game().liveStepHold }
    game().toggleHudDetail()
    expect({ money: game().money, vehicle: game().vehicle, hold: game().liveStepHold }).toEqual(
      before,
    )
  })
})
