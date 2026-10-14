import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { exportedSidecarOf, placeholderSidecarOf } from '../art/artCatalogue'
import type { PartsSidecar } from '../art/partsSidecar'
import { ATTACH_ASSET_ID, attachIdsOf } from '../art/sidecarAttach'
import { attachCoverageProblems, attachedItemsOfRegistries } from './attachCoverage'
import { CONTENT_REGISTRY, contentRegistrationOf } from './content'
import { addToRegistry, withFreshRegistrySet } from './seal'
import { ATTACH_IDS, ATTACH_USE_REGISTRY, attachOf, attachPointOfEquipped } from './vehicleAttach'
import {
  acceptedSlotsOf,
  LOADOUT_ACCEPTANCE_REGISTRY,
  LOADOUT_SLOT_IDS,
  slotOpenedBy,
} from './vehicleLoadout'

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
  it('holds the eight slots of the #162 table and the 32 attach points of K5 and ticket 376', () => {
    expect(LOADOUT_SLOT_IDS).toHaveLength(8)
    expect(ATTACH_IDS).toHaveLength(32)
    expect(new Set(ATTACH_IDS).size).toBe(32)
  })

  it('has no extractor slot, since extractors are mounted once owned', () => {
    expect(LOADOUT_SLOT_IDS.filter((slot) => slot.startsWith('rig.'))).toEqual([])
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

describe('power-up cradles', () => {
  const cradle = {
    id: 'mobility.cradle-3',
    iconId: 'icon-cradle',
    slots: [],
    attach: null,
    opensSlot: 'powerup.3',
  } as const

  it('open the slot they name, and no other item opens one', () => {
    const opened = withFreshRegistrySet(
      () => {
        registerBitAndAcceptance()
        addToRegistry(CONTENT_REGISTRY, 'mobility', contentRegistrationOf('vehicle-item', cradle))
      },
      () => [slotOpenedBy('mobility.cradle-3'), slotOpenedBy('drill-gear.bit')],
    )
    expect(opened).toEqual(['powerup.3', null])
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

  it('draws a "slot" power-up equipped in powerup.3 at hull.powerup.3', () => {
    const point = withFreshRegistrySet(registerSlotDrawnShield, () =>
      attachPointOfEquipped('mobility.shield', 'powerup.3'),
    )
    expect(point).toBe('hull.powerup.3')
  })

  it('draws a named-point item at its own point whatever slot holds it', () => {
    const point = withFreshRegistrySet(registerBitAndAcceptance, () =>
      attachPointOfEquipped('drill-gear.bit', 'powerup.2'),
    )
    expect(point).toBe('drill.hood')
  })
})

function registerSlotDrawnShield(): void {
  addToRegistry(
    CONTENT_REGISTRY,
    'mobility',
    contentRegistrationOf('vehicle-item', {
      id: 'mobility.shield',
      iconId: 'icon-shield',
      slots: ['powerup.1', 'powerup.2', 'powerup.3', 'powerup.4', 'powerup.5'],
      attach: 'slot',
    }),
  )
}

// The five aetheric power-ups as #265 will register them, each on its own point (TD lock on #265).
const AETHERIC_POINTS = {
  'power.resonance_whistle': 'hull.stack.side',
  'power.phase_lantern': 'hull.nose',
  'power.arc_coil': 'hull.roof.coils',
  'power.chronometric_governor': 'hull.tail',
  'power.aether_condenser': 'hull.flank',
} as const

function registerAethericFixtures(): void {
  for (const [id, attach] of Object.entries(AETHERIC_POINTS))
    addToRegistry(
      CONTENT_REGISTRY,
      'aetheric',
      contentRegistrationOf('vehicle-item', {
        id,
        iconId: 'icon-aetheric',
        slots: ['powerup.1', 'powerup.2', 'powerup.3', 'powerup.4', 'powerup.5'],
        attach,
      }),
    )
}

function vehicleSidecarsOf(): PartsSidecar[] {
  return [
    placeholderSidecarOf(SHIPPED_ART, ATTACH_ASSET_ID),
    exportedSidecarOf(SHIPPED_ART, ATTACH_ASSET_ID),
  ].filter((sidecar) => sidecar !== null)
}

describe('vehicle attach: the five aetheric points (ticket 376)', () => {
  const ids = Object.keys(AETHERIC_POINTS) as (keyof typeof AETHERIC_POINTS)[]

  it('draws a slotted aetheric power-up at its own point, never in the cradle it sits in', () => {
    const points = withFreshRegistrySet(registerAethericFixtures, () =>
      ids.map((id) => attachPointOfEquipped(id, 'powerup.2')),
    )
    expect(points).toEqual(Object.values(AETHERIC_POINTS))
  })

  it('resolves no point for an aetheric item no slice registers, so nothing draws there', () => {
    const points = withFreshRegistrySet(
      () => {},
      () => ids.map(attachOf),
    )
    expect(points).toEqual(ids.map(() => null))
  })

  it('keeps the coverage rule with the five registered, against both shipped vehicle sidecars', () => {
    const problems = withFreshRegistrySet(registerAethericFixtures, () =>
      vehicleSidecarsOf().flatMap((sidecar) =>
        attachCoverageProblems(attachedItemsOfRegistries(), attachIdsOf(sidecar)),
      ),
    )
    expect(vehicleSidecarsOf()).toHaveLength(2)
    expect(problems).toEqual([])
  })

  it('leaves each aetheric point at most one owner among the items the slices register', () => {
    const items = attachedItemsOfRegistries()
    const owners = Object.values(AETHERIC_POINTS).map(
      (point) => items.filter((item) => item.attach === point).length,
    )
    expect(owners.every((count) => count <= 1)).toBe(true)
  })
})
