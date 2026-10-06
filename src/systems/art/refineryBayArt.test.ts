import { describe, expect, it } from 'vitest'
import { blenderAssetIds, isValidPartId, vectorIconIds } from './artIds'

// The Refinery bay (#105, #106): a third platform bay with its backdrop, emblem and three looks.
describe('refinery bay art', () => {
  it('names the refinery bay, its backdrop and its emblem from the bay registry', () => {
    expect(blenderAssetIds()).toEqual(
      expect.arrayContaining(['platform-bay-refinery', 'platform-bay-refinery-backdrop']),
    )
    expect(vectorIconIds()).toContain('emblem-bay-refinery')
  })

  it('gives the refinery bay one part per look it shows (#105: idle, refining, ready)', () => {
    const looks = ['refinery-idle', 'refinery-refining', 'refinery-ready']
    expect(looks.every((part) => isValidPartId('platform-bay-refinery', part))).toBe(true)
    expect(isValidPartId('platform-bay-refinery', 'refinery-smelting')).toBe(false)
  })
})
