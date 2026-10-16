import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from './gameStore'

const game = () => useGameStore.getState()

beforeEach(() => resetGameStore())

describe('tap sheet', () => {
  it('starts with no tooltip pinned and no exact amount shown', () => {
    expect(game().pinnedTooltipId).toBeNull()
    expect(game().shownExactAmount).toBeNull()
  })

  it('pins a tapped tooltip and closes it on the next tap', () => {
    game().toggleTooltipPin('dock.shop.t1')
    expect(game().pinnedTooltipId).toBe('dock.shop.t1')
    game().toggleTooltipPin('dock.shop.t1')
    expect(game().pinnedTooltipId).toBeNull()
  })

  it('keeps one tooltip pinned at a time: a tap on another moves the pin', () => {
    game().toggleTooltipPin('dock.shop.t1')
    game().toggleTooltipPin('upgrade-bay.service')
    expect(game().pinnedTooltipId).toBe('upgrade-bay.service')
  })

  it('shows the exact amount a money readout holds, and closes it', () => {
    game().showExactAmount('-1.23456789e+149')
    expect(game().shownExactAmount).toBe('-1.23456789e+149')
    game().closeExactAmount()
    expect(game().shownExactAmount).toBeNull()
  })

  it('refuses a text that is not a decimal amount and keeps the sheet as it was', () => {
    expect(() => game().showExactAmount('1.2k')).toThrow(RangeError)
    expect(game().shownExactAmount).toBeNull()
  })

  it('changes nothing the authority holds: the wallet and the vehicle stay put', () => {
    const before = { money: game().money, vehicle: game().vehicle }
    game().toggleTooltipPin('dock.shop.t1')
    game().showExactAmount('1e+3')
    expect({ money: game().money, vehicle: game().vehicle }).toEqual(before)
  })
})
