import { describe, expect, it } from 'vitest'
import {
  clearShareOf,
  clearViewFloorOf,
  coveredAreaOf,
  doBoxesOverlap,
  isHintRoomFor,
  vehicleKeepClearOf,
  vehicleScreenBoxOf,
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

  it('keeps the vehicle inside a rect round the middle, wide and tall as the furthest lean', () => {
    const rect = vehicleKeepClearOf(PHONE)
    expect(rect.left).toBeGreaterThan(0)
    expect(rect.right).toBeLessThan(PHONE.width)
    expect((rect.left + rect.right) / 2).toBe(195)
    expect((rect.top + rect.bottom) / 2).toBe(422)
    // 0.6 of the half width and of the half height, plus the body's 0.45 m at the closest zoom
    // (8 m down 844 px, ticket 484).
    expect(rect.right - 195).toBeCloseTo(0.6 * 195 + 0.45 * (844 / 8), 6)
    expect(422 - rect.top).toBeCloseTo(0.6 * 422 + 0.45 * (844 / 8), 6)
  })

  it('keeps the rect square on a landscape screen', () => {
    const sideways = vehicleKeepClearOf({ width: 844, height: 390 })
    expect(sideways.right - sideways.left).toBeCloseTo(sideways.bottom - sideways.top, 6)
    expect(sideways.right - 422).toBeCloseTo(0.6 * 195 + 0.45 * (390 / 8), 6)
  })
})

describe('vehicle on screen (#500)', () => {
  const view = { width: 400, height: 800, pixelsPerMetre: 40, turnRadians: 0 }

  it('draws the vehicle at the middle with no lean, its body 0.9 m across', () => {
    const box = vehicleScreenBoxOf({ ...view, fromCentre: { x: 0, y: 0 } })
    expect(box).toEqual({ left: 182, top: 382, right: 218, bottom: 418 })
  })

  it('moves the vehicle up the screen when the camera leans down ahead of it', () => {
    const box = vehicleScreenBoxOf({ ...view, fromCentre: { x: 0, y: 2 } })
    expect((box.top + box.bottom) / 2).toBe(320)
  })

  it('turns the offset with the camera roll', () => {
    const box = vehicleScreenBoxOf({
      ...view,
      fromCentre: { x: 0, y: 2 },
      turnRadians: Math.PI / 2,
    })
    expect((box.left + box.right) / 2).toBeCloseTo(280, 6)
    expect((box.top + box.bottom) / 2).toBeCloseTo(400, 6)
  })

  it('stays inside the keep-clear rect at the furthest lean and the closest zoom', () => {
    const screen = { width: 390, height: 844 }
    const pixelsPerMetre = 844 / 8
    const leanAcross = (0.6 * 390) / 2 / pixelsPerMetre
    const leanUp = (0.6 * 844) / 2 / pixelsPerMetre
    const rect = vehicleKeepClearOf(screen)
    for (const fromCentre of [
      { x: leanAcross, y: 0 },
      { x: -leanAcross, y: 0 },
      { x: 0, y: leanUp },
      { x: 0, y: -leanUp },
    ]) {
      const box = vehicleScreenBoxOf({ ...screen, pixelsPerMetre, turnRadians: 0, fromCentre })
      expect(box.left).toBeGreaterThanOrEqual(rect.left - 1e-9)
      expect(box.right).toBeLessThanOrEqual(rect.right + 1e-9)
      expect(box.top).toBeGreaterThanOrEqual(rect.top - 1e-9)
      expect(box.bottom).toBeLessThanOrEqual(rect.bottom + 1e-9)
    }
  })
})

// GD ruling 2 on #500: with every control owned, three status chips and the hint, the view misses
// its floor by 1.0 to 5.4 points; #500 logs that share with a one-way ratchet, and #486 (threat
// chips, prompts, the status row) owns closing the gap. Each todo flips when #486 closes.
describe('clear view of the stacked worst case (owned by #486)', () => {
  it.todo('keeps 70% of 390x844 clear with every control owned, three status chips and the hint')
  it.todo('keeps 70% of 412x915 clear with every control owned, three status chips and the hint')
  it.todo('keeps 65% of 844x390 clear with every control owned, three status chips and the hint')
  it.todo('keeps 65% of 915x412 clear with every control owned, three status chips and the hint')
})
