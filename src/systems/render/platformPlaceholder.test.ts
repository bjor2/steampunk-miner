import { describe, expect, it } from 'vitest'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { bayPoseAt } from '../vehicle/vehiclePose'
import { coreBayFillOf, platformLookOf, platformOriginOf } from './platformPlaceholder'

const SITE = dockSiteOf(planetParamsFor(83921, 1))

describe('platform look', () => {
  it('keeps the whole outpost and adds the core drive assembly in the core_drive state', () => {
    const outpost = platformLookOf('outpost', SITE).shapes
    const coreDrive = platformLookOf('core_drive', SITE).shapes
    expect(coreDrive).toEqual(expect.arrayContaining([...outpost]))
    expect(coreDrive.length).toBeGreaterThan(outpost.length)
  })

  it('fills the core bay gauge as bay / coreNeeded, full at the need and past it', () => {
    expect(coreBayFillOf(0, 63)).toBe(0)
    expect(coreBayFillOf(17, 63)).toBeCloseTo(17 / 63, 9)
    expect(coreBayFillOf(63, 63)).toBe(1)
    expect(coreBayFillOf(80, 63)).toBe(1)
  })

  it('shows an empty bay on a planet with no core', () => {
    expect(coreBayFillOf(5, null)).toBe(0)
  })

  it('stands on the top of the pad, at its middle between the two bays', () => {
    expect(platformOriginOf(SITE)).toEqual({ x: 0, y: SITE.padRow + 1 })
  })

  it('stays clear of a vehicle docked at either bay, so it is never hidden', () => {
    // A docked vehicle: about a tile wide and tall, resting on its bay's centre line (#7, #37).
    const origin = platformOriginOf(SITE).x
    for (const bay of ['sell', 'upgrade'] as const) {
      const vehicleX = bayPoseAt(SITE, bay).x / 1000 - origin
      const overlapsVehicle = (shape: { offset: readonly number[]; size: readonly number[] }) =>
        Math.abs(shape.offset[0] - vehicleX) < shape.size[0] / 2 + 0.5 &&
        Math.abs(shape.offset[1] - 0.6) < shape.size[1] / 2 + 0.6
      expect(platformLookOf('core_drive', SITE).shapes.filter(overlapsVehicle)).toEqual([])
    }
  })

  it('marks each bay with a sign over its pad, the two told apart by shape as well as colour', () => {
    const shapes = platformLookOf('outpost', SITE).shapes
    const signsOver = (x: number) =>
      shapes.filter((shape) => shape.offset[0] === x && shape.offset[1] > 3)
    const sell = signsOver(-5)
    const upgrade = signsOver(7)
    expect(sell.map((shape) => shape.shape)).toEqual(['box', 'disc'])
    expect(upgrade.map((shape) => shape.shape)).toEqual(['box', 'box', 'box'])
  })
})
