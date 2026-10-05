import { describe, expect, it } from 'vitest'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { coreBayFillOf, platformLookOf, platformOriginOf } from './platformPlaceholder'

describe('platform look', () => {
  it('keeps the whole outpost and adds the core drive assembly in the core_drive state', () => {
    const outpost = platformLookOf('outpost').shapes
    const coreDrive = platformLookOf('core_drive').shapes
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

  it('stands on the top of the pad, over the dock point', () => {
    const site = dockSiteOf(planetParamsFor(83921, 1))
    expect(platformOriginOf(site)).toEqual({ x: site.dockPoint.tx + 0.5, y: site.padRow + 1 })
  })

  it('stays clear of the docked vehicle, so it is never hidden', () => {
    // The docked vehicle: about a tile wide and tall, centred over the dock point (#7, #8).
    const overlapsVehicle = (shape: { offset: readonly number[]; size: readonly number[] }) =>
      Math.abs(shape.offset[0]) < shape.size[0] / 2 + 0.5 &&
      Math.abs(shape.offset[1] - 0.6) < shape.size[1] / 2 + 0.6
    expect(platformLookOf('core_drive').shapes.filter(overlapsVehicle)).toEqual([])
  })
})
