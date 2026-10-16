import { describe, expect, it } from 'vitest'
import {
  clearShareOf,
  clearViewFloorOf,
  coveredAreaOf,
  doBoxesOverlap,
  isHintRoomFor,
  vehicleKeepClearOf,
} from './hudClearView'

const PHONE = { width: 390, height: 844 }
const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
})

describe('HUD clear view (#500)', () => {
  it('unions overlapping boxes once', () => {
    const area = coveredAreaOf([box(0, 0, 100, 100), box(50, 50, 150, 150)], PHONE)
    expect(area).toBe(100 * 100 * 2 - 50 * 50)
  })

  it('counts a box inside another once', () => {
    expect(coveredAreaOf([box(0, 0, 100, 100), box(10, 10, 20, 20)], PHONE)).toBe(10_000)
  })

  it('counts only the part of a box on the screen', () => {
    expect(coveredAreaOf([box(-50, -50, 50, 50)], PHONE)).toBe(2_500)
  })

  it('leaves the whole view clear with no box', () => {
    expect(clearShareOf([], PHONE)).toBe(1)
  })

  it('reads 70% upright and 65% sideways as the floors', () => {
    expect(clearViewFloorOf('portrait')).toBe(0.7)
    expect(clearViewFloorOf('landscape')).toBe(0.65)
  })

  it('queues a hint whose box would drop the clear share below the floor', () => {
    const hud = [box(0, 0, 390, 240)]
    expect(isHintRoomFor(hud, box(0, 240, 390, 300), PHONE, 0.7)).toBe(false)
  })

  it('shows a hint that fits with room to spare', () => {
    const hud = [box(0, 0, 390, 120)]
    expect(isHintRoomFor(hud, box(0, 128, 390, 180), PHONE, 0.7)).toBe(true)
  })

  it('treats touching edges as clear of each other, and shared area as overlap', () => {
    expect(doBoxesOverlap(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(false)
    expect(doBoxesOverlap(box(0, 0, 10, 10), box(9, 9, 20, 20))).toBe(true)
    expect(doBoxesOverlap(box(0, 0, 10, 10), box(9.6, 0, 20, 10), 0.5)).toBe(false)
  })

  it('keeps the vehicle inside a square round the middle, wide as the furthest lean', () => {
    const rect = vehicleKeepClearOf(PHONE)
    expect(rect.left).toBeGreaterThan(0)
    expect(rect.right).toBeLessThan(PHONE.width)
    expect((rect.left + rect.right) / 2).toBe(195)
    expect((rect.top + rect.bottom) / 2).toBe(422)
    // 0.6 of the half short axis, plus the body's 0.45 m at the closest zoom (8 m across 390 px).
    expect(rect.right - 195).toBeCloseTo(0.6 * 195 + 0.45 * (390 / 8), 6)
  })

  it('leans the same distance either way up, so a rotation keeps the rect square', () => {
    const upright = vehicleKeepClearOf(PHONE)
    const sideways = vehicleKeepClearOf({ width: 844, height: 390 })
    expect(upright.right - upright.left).toBeCloseTo(sideways.bottom - sideways.top, 6)
  })
})
