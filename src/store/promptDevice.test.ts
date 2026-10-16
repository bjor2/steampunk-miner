import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from './gameStore'
import { resetInput, routeKeyChange } from './inputRuntime'
import { readHudModel, readSettingsModel } from './screenReads'

beforeEach(() => {
  resetGameStore()
  resetInput()
})

/** A key no action is bound to: it only says the player is on the keyboard. */
const UNBOUND_KEY_DOWN = { code: 'KeyK', isDown: true, isRepeat: false, isShiftHeld: false }

const interactRow = () => readSettingsModel().bindings.find((row) => row.actionId === 'interact')

describe('prompts follow the input device (P1-4 of #470)', () => {
  it('names the key until a touch shows the touch controls, then the touch control', () => {
    expect(readHudModel().cachePrompt.text).toBe('Space: Ancient cache')
    useGameStore.getState().showTouchControls()
    expect(readHudModel().cachePrompt.text).toBe('Dock button: Ancient cache')
    expect(interactRow()?.keyText).toBe('Dock button')
  })

  it('names the key again once a key press hides the touch controls', () => {
    useGameStore.getState().showTouchControls()
    routeKeyChange(UNBOUND_KEY_DOWN)
    expect(readHudModel().cachePrompt.text).toBe('Space: Ancient cache')
    expect(interactRow()?.keyText).toBe('Space')
  })
})
