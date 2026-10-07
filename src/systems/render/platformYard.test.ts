import { describe, expect, it } from 'vitest'
import { bayColumnsOf } from '../world/dockBays'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { coreBayFillOf, platformOriginOf, platformYardLookOf, type PartShape } from './platformYard'

const SITE = dockSiteOf(planetParamsFor(83921, 1))

const leftOf = (shape: PartShape) => shape.offset[0] - shape.size[0] / 2
const rightOf = (shape: PartShape) => shape.offset[0] + shape.size[0] / 2

describe('platform yard', () => {
  it('keeps the whole yard and adds the core drive assembly in the core_drive state', () => {
    const outpost = platformYardLookOf('outpost').shapes
    const coreDrive = platformYardLookOf('core_drive').shapes
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

  it('stands on the top of the pad at the dock point, the middle of the yard', () => {
    expect(platformOriginOf(SITE)).toEqual({ x: 0, y: SITE.padRow + 1 })
  })

  it('stays inside the yard between the two buildings: the Refinery zone columns (#170)', () => {
    const yard = bayColumnsOf(dockSiteOf(planetParamsFor(83921, 3)), 'refinery')
    for (const shape of platformYardLookOf('core_drive').shapes) {
      expect(leftOf(shape)).toBeGreaterThanOrEqual(yard.firstColumn)
      expect(rightOf(shape)).toBeLessThanOrEqual(yard.lastColumn + 1)
    }
  })

  it('points a signpost board to each shop, the two told apart by shape as well as colour', () => {
    const boards = platformYardLookOf('outpost').shapes.filter(
      (shape) => shape.size[0] > 1 && shape.size[1] < 0.5,
    )
    expect(boards.map((board) => Math.sign(board.offset[0]))).toEqual([-1, 1])
    expect(boards[0].colour).not.toBe(boards[1].colour)
  })
})
