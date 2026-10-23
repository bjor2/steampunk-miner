import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from './gameStore'
import { pressAction, releaseAction, resetInput, routeKeyChange } from './inputRuntime'
import type { ActionId } from '../systems/input/actionMap'

// The star map's hook (spec #678, ticket 769): M opens the star map's panel from driving or a bay
// and shuts it again; while it is open Escape shuts it first. The game keeps running behind it.

const game = () => useGameStore.getState()

/** One key going down and coming up, as the shell sends it. */
function tapKey(code: string): void {
  routeKeyChange({ code, isDown: true, isRepeat: false, isShiftHeld: false })
  routeKeyChange({ code, isDown: false, isRepeat: false, isShiftHeld: false })
}

function tap(action: ActionId): void {
  pressAction(action)
  releaseAction(action)
}

beforeEach(() => {
  resetGameStore()
  resetInput()
})

describe('star map keys', () => {
  it('opens the star map with M while driving, and shuts it with M', () => {
    tapKey('KeyM')
    expect(game().isStarMapOpen).toBe(true)
    tapKey('KeyM')
    expect(game().isStarMapOpen).toBe(false)
  })

  it('shuts the open star map with Escape instead of opening the pause menu', () => {
    tapKey('KeyM')
    tapKey('Escape')
    expect(game().isStarMapOpen).toBe(false)
    expect(game().pauseMenu).toBeNull()
    tapKey('Escape')
    expect(game().pauseMenu).not.toBeNull()
  })

  it('opens the star map from a bay, where Escape shuts it before it undocks', () => {
    tap('interact')
    expect(game().vehicle.mode).toBe('docked')
    tapKey('KeyM')
    expect(game().isStarMapOpen).toBe(true)
    tapKey('Escape')
    expect(game().isStarMapOpen).toBe(false)
    expect(game().vehicle.mode).toBe('docked')
  })

  it('leaves the star map shut when M is pressed over the pause menu', () => {
    tapKey('Escape')
    tapKey('KeyM')
    expect(game().isStarMapOpen).toBe(false)
  })

  it('shuts the star map with its Close, as a click on the panel does', () => {
    game().toggleStarMap()
    game().closeStarMap()
    expect(game().isStarMapOpen).toBe(false)
  })
})
