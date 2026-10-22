import { describe, expect, it } from 'vitest'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import { isInFloorBand, type FloorBand } from './floorBand'
import { MM_PER_SAMPLE } from './sampleGrid'

// A level cut's floor band (GD lock on #662, Q2): the ground under the stamp's path, across the
// wheels' width, which the stamp takes down to its level floor in one pass.

const UPRIGHT_BAND: FloorBand = { upx: 0, upy: UP_VECTOR_SCALE, halfWidthMm: 450 }
const TAIL = { xMm: 10_000, yMm: 280_000 }
const HEAD = { xMm: 11_000, yMm: 280_000 }
const sampleAt = (xMm: number, yMm: number) => [xMm / MM_PER_SAMPLE, yMm / MM_PER_SAMPLE] as const

describe('floor band', () => {
  it('holds the ground under the path and half the wheels past either end', () => {
    expect(isInFloorBand(UPRIGHT_BAND, TAIL, HEAD, ...sampleAt(10_500, 279_500))).toBe(true)
    expect(isInFloorBand(UPRIGHT_BAND, TAIL, HEAD, ...sampleAt(11_250, 279_500))).toBe(true)
    expect(isInFloorBand(UPRIGHT_BAND, TAIL, HEAD, ...sampleAt(9_750, 279_500))).toBe(true)
  })

  it('stops half the wheels past the path', () => {
    expect(isInFloorBand(UPRIGHT_BAND, TAIL, HEAD, ...sampleAt(11_500, 279_500))).toBe(false)
    expect(isInFloorBand(UPRIGHT_BAND, TAIL, HEAD, ...sampleAt(9_500, 279_500))).toBe(false)
  })

  it('never holds the ground on or above the path', () => {
    expect(isInFloorBand(UPRIGHT_BAND, TAIL, HEAD, ...sampleAt(10_500, 280_000))).toBe(false)
    expect(isInFloorBand(UPRIGHT_BAND, TAIL, HEAD, ...sampleAt(10_500, 280_250))).toBe(false)
  })

  it('turns with the planet: under the path along its own up', () => {
    const sideways: FloorBand = { upx: UP_VECTOR_SCALE, upy: 0, halfWidthMm: 450 }
    const tail = { xMm: 280_000, yMm: 10_000 }
    const head = { xMm: 280_000, yMm: 11_000 }
    expect(isInFloorBand(sideways, tail, head, ...sampleAt(279_500, 10_500))).toBe(true)
    expect(isInFloorBand(sideways, tail, head, ...sampleAt(280_250, 10_500))).toBe(false)
  })
})
