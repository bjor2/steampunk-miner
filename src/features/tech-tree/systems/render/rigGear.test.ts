import { describe, expect, it } from 'vitest'
import {
  EMPTY_LOADOUT,
  withItemsOwned,
  withSlotItem,
  type VehicleLoadout,
} from '../../../../systems/vehicle/loadoutState'
import { GEAR_ART, vehicleWithPoints } from './gearArtFixture'
import { rigItemsOf, rigMountsOf, type RigMount } from './rigGear'

// The loaded slices register the mobility lane's items; the drill gear and sensing lanes are
// still vision rows, so their items are invisible.
const vehicle = vehicleWithPoints([
  { id: 'hull.powerup.1', atM: [-0.3, -0.02], z: 6 },
  { id: 'hull.powerup.2', atM: [-0.15, -0.02], z: 6 },
  { id: 'hull.arm.right', atM: [0.36, -0.12], z: 6 },
  { id: 'hull.roof.aft', atM: [-0.42, 0.24], z: 6 },
  { id: 'hull.rear', atM: [-0.58, -0.04], z: 2 },
  { id: 'drill.head', atM: [0.65, 0], z: 9 },
])

function loadoutOf(slots: Record<string, string>, owned: readonly string[] = []): VehicleLoadout {
  const withOwned = withItemsOwned(EMPTY_LOADOUT, [...Object.values(slots), ...owned])
  return Object.entries(slots).reduce(
    (loadout, [slot, itemId]) => withSlotItem(loadout, slot as 'powerup.1', itemId),
    withOwned,
  )
}

function mountsOf(loadout: VehicleLoadout) {
  return rigMountsOf(GEAR_ART, vehicle, rigItemsOf(loadout)).map(listed)
}

function listed(mount: RigMount) {
  return { assetId: mount.assetId, attachId: mount.attachId, partIds: partIdsOf(mount) }
}

function partIdsOf(mount: RigMount): string[] {
  return mount.quads.map((quad) => quad.partId).sort()
}

describe('rig gear', () => {
  it('mounts nothing on a vehicle that owns no items, so the car draws as before', () => {
    expect(mountsOf(EMPTY_LOADOUT)).toEqual([])
  })

  it('mounts owned mobility items at their points: housings in their cradles, the winch on its arm, crates on the rack', () => {
    const loadout = loadoutOf(
      { 'powerup.1': 'power.steam_shield', 'powerup.2': 'power.grapple_winch' },
      ['consumable.rivet_patch', 'consumable.smoke_canister'],
    )
    expect(mountsOf(loadout)).toEqual([
      {
        assetId: 'vehicle-item-power-grapple-winch',
        attachId: 'hull.arm.right',
        partIds: ['winch-drum', 'winch-hook'],
      },
      {
        assetId: 'vehicle-item-power-steam-shield',
        attachId: 'hull.powerup.1',
        partIds: ['shield-housing'],
      },
      {
        assetId: 'vehicle-rack-crates',
        attachId: 'hull.rear',
        partIds: ['crate-rivet-patch', 'crate-shelf', 'crate-smoke-canister'],
      },
    ])
  })

  it('leaves an owned power-up that sits in no cradle off the hull', () => {
    expect(mountsOf(loadoutOf({}, ['power.steam_boost']))).toEqual([])
  })

  it('never mounts an item that is still a vision row, whatever the loadout holds', () => {
    const loadout = loadoutOf({ 'drill.head': 'gear.twin_bit' }, ['power.echo_sounder'])
    expect(rigItemsOf(loadout)).toEqual([])
    expect(mountsOf(loadout)).toEqual([])
  })

  it('draws a housing at the point of the cradle it sits in', () => {
    const loadout = loadoutOf({ 'powerup.2': 'power.steam_boost' })
    const [boost] = rigMountsOf(GEAR_ART, vehicle, rigItemsOf(loadout))
    expect(boost?.attachId).toBe('hull.powerup.2')
    expect(boost?.quads[0]?.pivot).toEqual([-0.15, -0.02])
  })
})
