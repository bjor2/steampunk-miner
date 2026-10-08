import { describe, expect, it } from 'vitest'
import {
  cancelledTile,
  draggedTile,
  frameOfTile,
  IDLE_INPUT,
  pressedTile,
  releasedTile,
  type FireInput,
} from './tilePress'

const FACING_RIGHT = 255
const HOLD_TICKS = 15
const READY = 0

/** Frames from `fromTick` to `toTick`, one a tick, with the gun ready; the ticks shots went out. */
function framesThrough(input: FireInput, fromTick: number, toTick: number, nextShotTick = READY) {
  const shots: number[] = []
  let current = input
  for (let tick = fromTick; tick <= toTick; tick++) {
    const frame = frameOfTile(current, tick, nextShotTick, FACING_RIGHT, HOLD_TICKS)
    current = frame.input
    if (frame.shotBearing !== null) shots.push(frame.shotBearing)
  }
  return { input: current, shots }
}

describe('ground-gun: the fire tile under a finger (#309 touch input)', () => {
  it('fires nothing while a fresh press waits to see if it drags', () => {
    const { shots } = framesThrough(pressedTile(IDLE_INPUT, 10), 10, 10 + HOLD_TICKS - 1)
    expect(shots).toEqual([])
  })

  it('fires a quick tap along the facing on release', () => {
    const tapped = releasedTile(pressedTile(IDLE_INPUT, 10), 14, FACING_RIGHT)
    expect(framesThrough(tapped, 14, 14).shots).toEqual([FACING_RIGHT])
  })

  it('turns a press held without a drag into a held gun that fires along the facing', () => {
    const { shots, input } = framesThrough(pressedTile(IDLE_INPUT, 10), 10, 10 + HOLD_TICKS)
    expect(shots).toEqual([FACING_RIGHT])
    expect(input.press.phase).toBe('held')
    expect(input.hold.isHeld).toBe(true)
  })

  it('aims on a drag, never fires while aiming, and fires along the aim on release', () => {
    const aiming = draggedTile(pressedTile(IDLE_INPUT, 10), 200)
    const held = framesThrough(aiming, 10, 60)
    expect(held.shots).toEqual([])
    expect(held.input.press.aimBearing).toBe(200)
    expect(framesThrough(releasedTile(held.input, 61, FACING_RIGHT), 61, 61).shots).toEqual([200])
  })

  it('buffers the release of a hold the recovery outlasted as a tap', () => {
    const recovering = framesThrough(pressedTile(IDLE_INPUT, 10), 10, 40, 1000)
    expect(recovering.shots).toEqual([])
    const released = releasedTile(recovering.input, 41, FACING_RIGHT)
    expect(released.hold.tapExpiresTick).not.toBeNull()
  })

  it('lets a hold that already fired go on release, with nothing buffered', () => {
    const fired = framesThrough(pressedTile(IDLE_INPUT, 10), 10, 10 + HOLD_TICKS)
    const released = releasedTile(fired.input, 30, FACING_RIGHT)
    expect(released.hold.isHeld).toBe(false)
    expect(released.hold.tapExpiresTick).toBeNull()
  })

  it('fires nothing after a cancelled press', () => {
    const cancelled = cancelledTile(pressedTile(IDLE_INPUT, 10))
    expect(framesThrough(cancelled, 10, 80).shots).toEqual([])
  })
})
