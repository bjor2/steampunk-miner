import { describe, expect, it } from 'vitest'
import { CONTENT_REGISTRY, contentRegistrationOf } from './content'
import { addToRegistry, withFreshRegistrySet } from './seal'
import { ATTACH_IDS, ATTACH_USE_REGISTRY, attachOf } from './vehicleAttach'
import { acceptedSlotsOf, LOADOUT_ACCEPTANCE_REGISTRY, LOADOUT_SLOT_IDS } from './vehicleLoadout'

function registerBitAndAcceptance(): void {
  addToRegistry(
    CONTENT_REGISTRY,
    'drill-gear',
    contentRegistrationOf('vehicle-item', {
      id: 'drill-gear.bit',
      iconId: 'icon-bit',
      slots: ['drill.head'],
      attach: 'drill.hood',
    }),
  )
  addToRegistry(LOADOUT_ACCEPTANCE_REGISTRY, 'power-up-core', {
    id: 'power-up-core.bit-in-powerup',
    itemId: 'drill-gear.bit',
    slots: ['powerup.2', 'drill.head'],
  })
}

describe('vehicle loadout registry', () => {
  it('holds the ten slots and thirteen attach points of the #162 table', () => {
    expect(LOADOUT_SLOT_IDS).toHaveLength(10)
    expect(ATTACH_IDS).toHaveLength(13)
  })

  it('accepts an item in its own slots and every slot an acceptance adds, in slot-table order', () => {
    const slots = withFreshRegistrySet(registerBitAndAcceptance, () =>
      acceptedSlotsOf('drill-gear.bit'),
    )
    expect(slots).toEqual(['powerup.2', 'drill.head'])
  })

  it('accepts an unknown item in no slot', () => {
    expect(withFreshRegistrySet(registerBitAndAcceptance, () => acceptedSlotsOf('nope'))).toEqual(
      [],
    )
  })
})

describe('vehicle attach registry', () => {
  it("reads an item's own attach point when no attach use is registered", () => {
    expect(withFreshRegistrySet(registerBitAndAcceptance, () => attachOf('drill-gear.bit'))).toBe(
      'drill.hood',
    )
  })

  it("prefers a registered attach use over the item's own attach point", () => {
    const attach = withFreshRegistrySet(
      () => {
        registerBitAndAcceptance()
        addToRegistry(ATTACH_USE_REGISTRY, 'drill-gear', {
          id: 'drill-gear.bit-on-head',
          itemId: 'drill-gear.bit',
          attach: 'drill.head',
        })
      },
      () => attachOf('drill-gear.bit'),
    )
    expect(attach).toBe('drill.head')
  })

  it('attaches an unknown item nowhere', () => {
    expect(withFreshRegistrySet(registerBitAndAcceptance, () => attachOf('nope'))).toBeNull()
  })
})
