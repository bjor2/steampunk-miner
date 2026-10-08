import { describe, expect, it } from 'vitest'
import {
  EMPTY_LOADOUT,
  withItemsOwned,
  withSlotItem,
  type VehicleLoadout,
} from '../../../../systems/vehicle/loadoutState'
import { GEAR_ART, vehicleWithPoints } from './gearArtFixture'
import {
  deployedPivotOf,
  deployingExtractorPartOf,
  FOLDED,
  pivotedQuadOf,
  rigItemsOf,
  rigMountsOf,
  type RigMount,
} from './rigGear'
import { mountedGearQuadsOf, type GearQuad, type MountedItem } from './techGearQuads'

// The loaded slices register the mobility and sensing lanes' items; the galvanic probe and the void
// sounder (#203 Q3) are still held vision rows, so they are invisible.
const vehicle = vehicleWithPoints([
  { id: 'hull.powerup.1', atM: [-0.3, -0.02], z: 6 },
  { id: 'hull.powerup.2', atM: [-0.15, -0.02], z: 6 },
  { id: 'hull.arm.right', atM: [0.36, -0.12], z: 6 },
  { id: 'hull.roof.aft', atM: [-0.42, 0.24], z: 6 },
  { id: 'hull.rear', atM: [-0.58, -0.04], z: 2 },
  { id: 'drill.head', atM: [0.65, 0], z: 9 },
  { id: 'drill.fork', atM: [0.42, 0], z: 7 },
  { id: 'drill.hood', atM: [0.5, 0.1], z: 7 },
  { id: 'drill.flank', atM: [0.58, 0], z: 7 },
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
    const loadout = loadoutOf({
      'powerup.1': 'power.galvanic_probe',
      'powerup.2': 'power.void_sounder',
    })
    expect(rigItemsOf(loadout)).toEqual([])
    expect(mountsOf(loadout)).toEqual([])
  })

  it('draws a housing at the point of the cradle it sits in', () => {
    const loadout = loadoutOf({ 'powerup.2': 'power.steam_boost' })
    const [boost] = rigMountsOf(GEAR_ART, vehicle, rigItemsOf(loadout))
    expect(boost?.attachId).toBe('hull.powerup.2')
    expect(boost?.quads[0]?.pivot).toEqual([-0.15, -0.02])
  })

  it('holds a mirrored part about its pivot so its group lands it where the mirror placed it', () => {
    const below: GearQuad = {
      partId: 'cutter-arm',
      centre: [0.6, -0.1],
      pivot: [0.58, -0.04],
      size: [0.2, 0.2],
      z: 7,
      colour: '#888888',
      uv: null,
      itemId: 'gear.side_cutters',
      turn: -0.9,
      mirrorY: true,
    }
    const posed = pivotedQuadOf(below)
    expect(posed).toMatchObject({ pivot: [0.58, -0.04], turn: -0.9, scaleY: -1 })
    const [x, y] = posed.quad.centre
    expect(posed.quad.pivot).toEqual([0, 0])
    expect(posed.pivot[0] + x).toBeCloseTo(0.6)
    expect(posed.pivot[1] + y * posed.scaleY).toBeCloseTo(-0.1)
  })

  it('stands a deploying extractor part where laying the gear out at that fraction puts it', () => {
    for (const itemId of ['rig.resonance', 'rig.containment']) {
      for (const fraction of [0, 0.3, 1]) {
        expect(pivotsDeployedFromFolded({ itemId, slot: null }, fraction)).toEqual(
          pivotsLaidOutAt({ itemId, slot: null }, fraction),
        )
      }
    }
  })

  it('reverses the turn of the far-side copy as the mirror places it', () => {
    const cutters: MountedItem = { itemId: 'gear.side_cutters', slot: 'drill.flank' }
    const [above, below] = mountedGearQuadsOf(GEAR_ART, vehicle, cutters, FOLDED).filter(
      (quad) => quad.partId === 'cutter-arm',
    )
    const arm = {
      id: 'cutter-arm',
      folded: { turn: 0.9, shift: [0, 0.05] as const },
      deployed: { turn: 0, shift: [0, 0] as const },
    }
    const [, aboveZ] = deployedPivotOf(above!, arm, 1).pivot
    const [, belowZ] = deployedPivotOf(below!, arm, 1).pivot
    expect(aboveZ).toBeCloseTo((above?.pivot[1] ?? 0) - 0.05)
    expect(belowZ).toBeCloseTo((below?.pivot[1] ?? 0) + 0.05)
    expect(deployedPivotOf(below!, arm, 0).turn).toBeCloseTo(-0.9)
  })

  it('deploys only extractor parts that move, leaving fixed parts and other gear folded', () => {
    const partsOf = (item: MountedItem) =>
      mountedGearQuadsOf(GEAR_ART, vehicle, item, FOLDED)
        .filter((quad) => deployingExtractorPartOf(quad) !== null)
        .map((quad) => quad.partId)
    expect(partsOf({ itemId: 'rig.resonance', slot: null })).toEqual(['fork-prongs'])
    expect(partsOf({ itemId: 'gear.side_cutters', slot: 'drill.flank' })).toEqual([])
  })
})

function pivotsDeployedFromFolded(item: MountedItem, fraction: number) {
  return mountedGearQuadsOf(GEAR_ART, vehicle, item, FOLDED).map((quad) => {
    const part = deployingExtractorPartOf(quad)
    return part === null ? pivotOf(quad) : deployedPivotOf(quad, part, fraction)
  })
}

function pivotsLaidOutAt(item: MountedItem, fraction: number) {
  return mountedGearQuadsOf(GEAR_ART, vehicle, item, fraction).map(pivotOf)
}

function pivotOf(quad: GearQuad) {
  const { pivot, turn } = pivotedQuadOf(quad)
  return { pivot, turn }
}
