import { describe, expect, it } from 'vitest'
import { screenLayoutOf } from '../../../../systems/views/screenLayout'
import { FACING } from '../../../../systems/vehicle/vehiclePose'
import { plaqueBandOn, plaqueFitOf } from './plaqueFit'

// The #173 reference screens (docs/screens/README.md), as the shell lays them out.
const layoutOf = (widthPixels: number, heightPixels: number, isTvMode = false) =>
  screenLayoutOf({ widthPixels, heightPixels, isCoarsePointer: false }, isTvMode)

describe('plaque fit', () => {
  it.each([
    ['desktop', 1920, 1080],
    ['ultra-wide', 2560, 1080],
    ['tablet', 1180, 820],
    ['the 1280 x 800 minimum', 1280, 800],
    ['a 4K desktop', 3840, 2160],
  ])('keeps the full plaque in the top band on %s', (_, width, height) => {
    expect(plaqueFitOf(layoutOf(width, height))).toBe('full')
  })

  it.each([
    ['a phone held sideways', 844, 390, false],
    ['a Pixel held sideways', 915, 412, false],
    ['a TV', 3840, 2160, true],
    ['a 1080p TV', 1920, 1080, true],
  ])('shows one line in the bottom band on %s', (_, width, height, isTvMode) => {
    expect(plaqueFitOf(layoutOf(width, height, isTvMode))).toBe('line')
  })

  it('shows the full plaque before the screen is first fitted', () => {
    expect(plaqueFitOf(null)).toBe('full')
  })

  it('puts the one-line plaque in the bottom band even at rest', () => {
    const atRest = { alongSpeed: 0, upwardSpeed: 0, driveSpeed: 4, facing: FACING.down }
    expect([plaqueBandOn('line', atRest), plaqueBandOn('full', atRest)]).toEqual(['bottom', 'top'])
  })
})
