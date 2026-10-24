import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { ECONOMY } from '../economy/economy'
import { blenderAssetIds, categoryOfAssetId, isValidPartId, registryPartIds } from './artIds'
import { manifestEntryOf, placeholderSidecarOf } from './artCatalogue'
import {
  firstSystemPreviewAssetIds,
  lookKeyOfPreviewAsset,
  orbitPositionOf,
  STAR_MAP_CAROUSEL_MOTION,
  STAR_MAP_DOT,
  STAR_MAP_HERO,
  STAR_MAP_SYSTEM,
  STAR_MAP_SYSTEM_ASSET_ID,
  starMapCarouselKernelAssetIds,
  starMapCarouselKernelPartIds,
  starMapDotPartIdOf,
  starMapPreviewAssetIdOf,
  starMapPreviewPartIds,
  starMapSystemPartIds,
} from './starMapCarouselArt'

// The star map carousel's art (ticket 795, spec #647): a preview per look under the ui category,
// the first system's five named by place and a later system's by palette look, and the system
// strip with its orbits, read from one brief the Blender scripts share.

describe('star map carousel art ids', () => {
  it('names a preview per first-system place and the system strip under the ui category', () => {
    const places = ECONOMY.starMap.planetsPerSystem
    expect(firstSystemPreviewAssetIds()).toHaveLength(places)
    expect(firstSystemPreviewAssetIds()[0]).toBe('ui-star-map-planet-1')
    expect(starMapCarouselKernelAssetIds()).toEqual([
      ...firstSystemPreviewAssetIds(),
      STAR_MAP_SYSTEM_ASSET_ID,
    ])
    for (const assetId of starMapCarouselKernelAssetIds()) {
      expect(categoryOfAssetId(assetId)).toBe('ui')
      expect(blenderAssetIds()).toContain(assetId)
    }
  })

  it('keys a preview by its look and reads the key back, so a palette look needs no new rule', () => {
    expect(starMapPreviewAssetIdOf('rime-shelf')).toBe('ui-star-map-planet-rime-shelf')
    expect(lookKeyOfPreviewAsset('ui-star-map-planet-rime-shelf')).toBe('rime-shelf')
    expect(lookKeyOfPreviewAsset('ui-star-map-planet-3')).toBe('3')
    expect(lookKeyOfPreviewAsset('ui-star-map')).toBeNull()
    expect(lookKeyOfPreviewAsset('ui-star-map-system')).toBeNull()
  })

  it('gives every preview a hero and an orbit dot, and the strip its frame, here ring and marker', () => {
    expect(starMapPreviewPartIds('ui-star-map-planet-2')).toEqual([
      'ui-star-map-planet-2',
      'ui-star-map-planet-2-dot',
    ])
    expect(starMapDotPartIdOf('ui-star-map-planet-2')).toBe('ui-star-map-planet-2-dot')
    expect(starMapSystemPartIds()).toEqual([
      'ui-star-map-system',
      'ui-star-map-system-frame',
      'ui-star-map-system-here',
      'ui-star-map-system-selected',
    ])
    for (const partId of starMapCarouselKernelPartIds()) {
      expect(registryPartIds()).toContain(partId)
    }
    expect(isValidPartId('ui-star-map-planet-1', 'ui-star-map-planet-1-dot')).toBe(true)
  })

  it('ships a manifest entry and a placeholder at the brief sizes for each kernel asset', () => {
    for (const assetId of firstSystemPreviewAssetIds()) {
      expect(manifestEntryOf(SHIPPED_ART, assetId)).not.toBeNull()
      const placeholder = placeholderSidecarOf(SHIPPED_ART, assetId)
      expect(placeholder?.parts.map((part) => part.id).sort()).toEqual(
        [...starMapPreviewPartIds(assetId)].sort(),
      )
      expect(placeholder?.parts.find((part) => part.id === assetId)?.sizeM).toEqual([
        STAR_MAP_HERO.sizePx,
        STAR_MAP_HERO.sizePx,
      ])
      expect(placeholder?.parts.find((part) => part.id !== assetId)?.sizeM).toEqual([
        STAR_MAP_DOT.sizePx,
        STAR_MAP_DOT.sizePx,
      ])
    }
    const strip = placeholderSidecarOf(SHIPPED_ART, STAR_MAP_SYSTEM_ASSET_ID)
    expect(manifestEntryOf(SHIPPED_ART, STAR_MAP_SYSTEM_ASSET_ID)).not.toBeNull()
    expect(strip?.parts.map((part) => part.id).sort()).toEqual([...starMapSystemPartIds()].sort())
    expect(strip?.parts.find((part) => part.id === STAR_MAP_SYSTEM_ASSET_ID)?.sizeM).toEqual(
      STAR_MAP_SYSTEM.sizePx,
    )
    expect(strip?.parts.find((part) => part.id.endsWith('-frame'))?.insetPx).toEqual([
      STAR_MAP_SYSTEM.frame.insetPx,
      STAR_MAP_SYSTEM.frame.insetPx,
    ])
  })
})

describe('star map system strip layout', () => {
  it('holds one orbit per place of a system, each inside the strip and farther out than the last', () => {
    const [width, height] = STAR_MAP_SYSTEM.sizePx
    expect(STAR_MAP_SYSTEM.orbitRadiiPx).toHaveLength(ECONOMY.starMap.planetsPerSystem)
    let last = STAR_MAP_SYSTEM.sunRadiusPx
    for (const radius of STAR_MAP_SYSTEM.orbitRadiiPx) {
      expect(radius).toBeGreaterThan(last)
      last = radius
    }
    for (let place = 1; place <= ECONOMY.starMap.planetsPerSystem; place += 1) {
      const [x, y] = orbitPositionOf(place)
      expect(x).toBeLessThan(width - STAR_MAP_DOT.sizePx)
      expect(y).toBe(height / 2)
    }
  })

  it('sets a planet on the middle line at its orbit from the sun, and refuses a place with none', () => {
    expect(orbitPositionOf(1)).toEqual([
      STAR_MAP_SYSTEM.sunCentrePx[0] + STAR_MAP_SYSTEM.orbitRadiiPx[0],
      STAR_MAP_SYSTEM.sunCentrePx[1],
    ])
    expect(orbitPositionOf(5)[0]).toBeGreaterThan(orbitPositionOf(4)[0])
    expect(() => orbitPositionOf(6)).toThrow(RangeError)
    expect(() => orbitPositionOf(0)).toThrow(RangeError)
  })

  it('fits the hero at 1x and the strip at the 4x supersample inside one 4096 px atlas', () => {
    expect(STAR_MAP_HERO.sizePx * 2).toBeGreaterThanOrEqual(512)
    expect(STAR_MAP_HERO.hazeOuterRadiusPx * 2).toBeLessThanOrEqual(STAR_MAP_HERO.sizePx)
    expect(STAR_MAP_HERO.ringSemiAxesPx[0] * 2).toBeLessThanOrEqual(STAR_MAP_HERO.sizePx)
    expect(STAR_MAP_SYSTEM.sizePx[0] * 4 + 16).toBeLessThanOrEqual(4096)
    expect(STAR_MAP_SYSTEM.frame.insetPx * 2).toBeLessThan(STAR_MAP_SYSTEM.frame.sizePx)
  })

  it('pans within the lock’s step and reads a swipe apart from the chart’s scroll', () => {
    expect(STAR_MAP_CAROUSEL_MOTION.panMaxMs).toBeLessThanOrEqual(400)
    expect(STAR_MAP_CAROUSEL_MOTION.swipeThresholdPx).toBeGreaterThan(
      STAR_MAP_CAROUSEL_MOTION.swipeMaxOffAxisPx,
    )
    expect(STAR_MAP_CAROUSEL_MOTION.panEasing.startsWith('cubic-bezier(')).toBe(true)
  })
})
