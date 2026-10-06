import { describe, expect, it } from 'vitest'
import { CONTENT_REGISTRY, contentIconIds, contentOf, contentRegistrationOf } from './content'
import { addToRegistry, withFreshRegistrySet } from './seal'
import type { VehicleItem } from './vehicleLoadout'

const drillBit: VehicleItem = {
  id: 'drill-gear.bit',
  iconId: 'icon-bit',
  slots: ['drill.head'],
  attach: 'drill.head',
}
const anchor: VehicleItem = {
  id: 'mobility.anchor',
  iconId: 'icon-anchor',
  slots: [],
  attach: null,
}

function registerItems(): void {
  addToRegistry(CONTENT_REGISTRY, 'mobility', contentRegistrationOf('vehicle-item', anchor))
  addToRegistry(CONTENT_REGISTRY, 'drill-gear', contentRegistrationOf('vehicle-item', drillBit))
}

describe('content registry', () => {
  it('reads a kind with nothing registered as no entries', () => {
    expect(
      withFreshRegistrySet(
        () => undefined,
        () => contentOf('vehicle-item'),
      ),
    ).toEqual([])
  })

  it('reads a kind sorted by entry id', () => {
    const items = withFreshRegistrySet(registerItems, () => contentOf('vehicle-item'))
    expect(items).toEqual([drillBit, anchor])
  })

  it('lists every entry with its kind and icon for the icon coverage test', () => {
    expect(withFreshRegistrySet(registerItems, contentIconIds)).toEqual([
      { kind: 'vehicle-item', id: 'drill-gear.bit', iconId: 'icon-bit' },
      { kind: 'vehicle-item', id: 'mobility.anchor', iconId: 'icon-anchor' },
    ])
  })
})
