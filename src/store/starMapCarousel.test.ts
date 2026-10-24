import { beforeEach, describe, expect, it } from 'vitest'
import { starMapBuyFuelIdOf, starMapJumpIdOf } from '../systems/views/starMapControlIds'
import { resetGameStore, useGameStore } from './gameStore'
import { pressAction, releaseAction, resetInput, routeKeyChange } from './inputRuntime'
import { readStarMapCarousel, readStarMapControls } from './screenReads'
import type { ActionId } from '../systems/input/actionMap'

// The star map carousel's selection (ticket 796): local UI state beside the star map's panel.
// Opening the map shows the planet the session is on; Previous/Next, a swipe and, at a bay, ←/→
// step it and stop at the ends; a planet picked on the system strip is shown; a step leaves no
// Jump armed. Only the shown planet's Jump is a focus stop.

const game = () => useGameStore.getState()
const shownPlace = () => readStarMapCarousel().planet.place

function tapKey(code: string): void {
  routeKeyChange({ code, isDown: true, isRepeat: false, isShiftHeld: false })
  routeKeyChange({ code, isDown: false, isRepeat: false, isShiftHeld: false })
}

function tap(action: ActionId): void {
  pressAction(action)
  releaseAction(action)
}

function openMapAtTheBay(): void {
  tap('interact')
  expect(game().vehicle.mode).toBe('docked')
  game().toggleStarMap()
}

beforeEach(() => {
  resetGameStore()
  resetInput()
})

describe('star map carousel selection (ticket 796)', () => {
  it('opens on the planet the session is on, whatever was shown before', () => {
    game().toggleStarMap()
    game().showStarMapPlanet(4)
    expect(shownPlace()).toBe(4)
    game().closeStarMap()
    game().toggleStarMap()
    expect(game().starMapPlace).toBeNull()
    expect(shownPlace()).toBe(1)
  })

  it('steps on and back one planet at a time and stops at the ends', () => {
    game().toggleStarMap()
    game().stepStarMapPlanet(-1)
    expect(shownPlace()).toBe(1)
    for (let step = 0; step < 6; step++) game().stepStarMapPlanet(1)
    expect(shownPlace()).toBe(5)
    game().stepStarMapPlanet(-1)
    expect(shownPlace()).toBe(4)
  })

  it('shows the planet picked on the system strip', () => {
    game().toggleStarMap()
    game().showStarMapPlanet(3)
    expect(readStarMapCarousel().strip.dots.find((dot) => dot.isSelected)?.place).toBe(3)
  })

  it('steps with the right and left keys at a bay while the map is open', () => {
    openMapAtTheBay()
    tapKey('ArrowRight')
    tapKey('ArrowRight')
    expect(shownPlace()).toBe(3)
    tapKey('ArrowLeft')
    expect(shownPlace()).toBe(2)
    expect(game().isStarMapOpen).toBe(true)
  })

  it('leaves no Jump armed after a step, so a confirm never lands on another planet', () => {
    openMapAtTheBay()
    game().giveMoney('1e9')
    game().stepStarMapPlanet(1)
    game().pressScreenButton(starMapBuyFuelIdOf(2))
    game().pressScreenButton(starMapJumpIdOf(2))
    expect(game().armedJumpId).toBe(starMapJumpIdOf(2))
    game().stepStarMapPlanet(1)
    expect(game().armedJumpId).toBeNull()
  })

  it("makes only the shown planet's Jump a focus stop", () => {
    openMapAtTheBay()
    game().showStarMapPlanet(3)
    const stops = readStarMapControls().focusStops.map((stop) => stop.id)
    expect(stops).toContain(starMapJumpIdOf(3))
    expect(stops).not.toContain(starMapJumpIdOf(2))
  })
})
