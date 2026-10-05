import { describe, expect, it } from 'vitest'
import { MISSING_ART_COLOUR, partsShownAtTier, placeholderQuadsOf } from './placeholderLook'
import type { SidecarPart } from './partsSidecar'

const idsAt = (tier: number) => placeholderQuadsOf('vehicle', tier).map((quad) => quad.partId)

const part = (id: string, tier: number, z = 0): SidecarPart => ({
  id,
  tier,
  rect: [0, 0, 8, 8],
  sizeM: [0.4, 0.2],
  pivotM: [0.2, 0],
  atM: [1, 1],
  z,
})

describe('placeholder look', () => {
  it('draws a missing asset id as one magenta quad named after it', () => {
    expect(placeholderQuadsOf('enemy-dragon', 1)).toEqual([
      { partId: 'enemy-dragon', centre: [0, 0], size: [1, 1], z: 0, colour: MISSING_ART_COLOUR },
    ])
  })

  it('draws a placeholder asset from its sidecar parts in the manifest colours', () => {
    const [crawler] = placeholderQuadsOf('enemy-crawler', 1)
    expect(crawler).toMatchObject({ partId: 'enemy-crawler', size: [0.8, 0.8] })
    expect(crawler.colour).not.toBe(MISSING_ART_COLOUR)
  })

  it('centres a quad from its pivot: the pivot sits at atM, pivotM from the bottom-left', () => {
    const [hub] = placeholderQuadsOf('platform-hub', 1).filter((quad) => quad.partId === 'outpost')
    expect(hub.centre[0]).toBeCloseTo(-3.4)
    expect(hub.centre[1]).toBeCloseTo(1.6)
  })

  it('keeps the tier-1 parts a higher tier does not replace, and swaps the ones it does', () => {
    const shown = partsShownAtTier(
      [part('t1-wheel', 1), part('t1-chassis', 1), part('t2-chassis', 2), part('t3-boiler', 3)],
      2,
    )
    expect(shown.map((shownPart) => shownPart.id)).toEqual(['t1-wheel', 't2-chassis'])
  })

  it('lists parts lowest draw order first', () => {
    const shown = partsShownAtTier([part('t1-headlamp', 1, 4), part('t1-wheel', 1, 1)], 1)
    expect(shown.map((shownPart) => shownPart.z)).toEqual([1, 4])
  })

  it('adds side armour and a second stack at tier 2, a second boiler and lamp at tier 3 (#7)', () => {
    expect(idsAt(1).filter((id) => id.includes('armour-plate'))).toEqual([])
    expect(idsAt(2)).toEqual(
      expect.arrayContaining(['t2-armour-plate', 't2-armour-plate-2', 't1-stack', 't2-stack-2']),
    )
    expect(idsAt(3)).toEqual(expect.arrayContaining(['t3-boiler-2', 't3-headlamp-2']))
  })

  it.each([2, 3])('shows more on the vehicle at visual tier %i than the tier below', (tier) => {
    expect(idsAt(tier).length).toBeGreaterThan(idsAt(tier - 1).length)
  })

  it('draws tiers past 3 as tier 3, the last authored look', () => {
    expect(idsAt(7)).toEqual(idsAt(3))
  })
})
