import { describe, expect, it } from 'vitest'
import {
  EMPTY_LOADOUT,
  withItemsOwned,
  withSlotItem,
} from '../../../../systems/vehicle/loadoutState'
import {
  gearAttachIdOf,
  mountedGearQuadsOf,
  mountedItemsOf,
  vehicleGearQuadsOf,
} from './techGearQuads'
import { GEAR_ART, vehicleWithPoints } from './gearArtFixture'
import { CRATE_RACK, mountedGearOf } from './techGear'

// The base vehicle's points these specs need; `hull.front` is left out on purpose.
const VEHICLE_ATTACH = [
  { id: 'drill.fork', atM: [0.42, 0], z: 7 },
  { id: 'drill.flank', atM: [0.58, 0], z: 7 },
  { id: 'hull.rear', atM: [-0.58, -0.04], z: 2 },
  { id: 'hull.powerup.3', atM: [0, -0.02], z: 6 },
  { id: 'cab.gauge', atM: [0.3, 0.08], z: 5 },
] as const

const art = GEAR_ART
const vehicle = vehicleWithPoints(VEHICLE_ATTACH)

describe('tech gear quads: parts at the vehicle attach points', () => {
  it('draws an owned extractor at its named point, moved by the sidecar atM and nothing else', () => {
    const quads = mountedGearQuadsOf(art, vehicle, { itemId: 'rig.resonance', slot: null }, 1)
    expect(quads.map((quad) => quad.partId)).toEqual(['fork-prongs', 'fork-yoke'])
    for (const quad of quads) {
      expect(quad.pivot).toEqual([0.42, 0])
      expect(quad.centre).toEqual([0.42, 0])
      expect(quad.mirrorY).toBe(false)
    }
  })

  it('shifts a folded part by its folded pose, so an idle fork sits retracted', () => {
    const [prongs] = mountedGearQuadsOf(art, vehicle, { itemId: 'rig.resonance', slot: null }, 0)
    expect(prongs?.partId).toBe('fork-prongs')
    expect(prongs?.pivot[0]).toBeCloseTo(0.42 - 0.11)
  })

  it('draws a "slot" housing at the hull.powerup point of the slot it is equipped in', () => {
    const shield = mountedGearOf('power.steam_shield')
    expect(shield && gearAttachIdOf(shield, 'powerup.3')).toBe('hull.powerup.3')
    expect(shield && gearAttachIdOf(shield, null)).toBeNull()
    const quads = mountedGearQuadsOf(
      art,
      vehicle,
      { itemId: 'power.steam_shield', slot: 'powerup.3' },
      0,
    )
    expect(quads).toHaveLength(1)
    expect(quads[0]?.pivot).toEqual([0, -0.02])
  })

  it('draws nothing for an item whose point the sidecar lacks, or that has no gear', () => {
    expect(mountedGearQuadsOf(art, vehicle, { itemId: 'rig.induction', slot: null }, 1)).toEqual([])
    expect(mountedGearQuadsOf(art, vehicle, { itemId: 'slot.powerup_3', slot: null }, 1)).toEqual(
      [],
    )
  })

  it('mirrors the side cutters below the drill axis with the turn reversed', () => {
    const quads = mountedGearQuadsOf(
      art,
      vehicle,
      { itemId: 'gear.side_cutters', slot: 'drill.flank' },
      0,
    )
    const arms = quads.filter((quad) => quad.partId === 'cutter-arm')
    expect(arms).toHaveLength(2)
    const [above, below] = arms
    expect(above?.mirrorY).toBe(false)
    expect(below?.mirrorY).toBe(true)
    expect(below?.pivot[1]).toBeCloseTo(-(above?.pivot[1] ?? 0))
    expect(below?.turn).toBeCloseTo(-(above?.turn ?? 0))
    expect(above?.turn).toBeCloseTo(0.9)
  })

  it('lists what a loadout draws: owned extractors and crates, and slotted gear in its slot', () => {
    const loadout = withSlotItem(
      withItemsOwned(EMPTY_LOADOUT, [
        'rig.containment',
        'consumable.cryo_binder',
        'power.steam_shield',
      ]),
      'powerup.2',
      'power.steam_shield',
    )
    expect(mountedItemsOf(loadout)).toEqual([
      { itemId: 'consumable.cryo_binder', slot: null },
      { itemId: 'rig.containment', slot: null },
      { itemId: 'power.steam_shield', slot: 'powerup.2' },
    ])
  })

  it('leaves an owned but unequipped slot item off the vehicle', () => {
    const loadout = withItemsOwned(EMPTY_LOADOUT, ['power.steam_shield'])
    expect(mountedItemsOf(loadout)).toEqual([])
  })

  it('leaves a spare drill head off the drill, drawing only the one in its socket', () => {
    const loadout = withSlotItem(
      withItemsOwned(EMPTY_LOADOUT, ['gear.thaw_crown', 'gear.vibratory_bit']),
      'drill.head',
      'gear.vibratory_bit',
    )
    expect(mountedItemsOf(loadout)).toEqual([{ itemId: 'gear.vibratory_bit', slot: 'drill.head' }])
  })

  it('draws the crate shelf once however many consumables ride it', () => {
    const items = [
      { itemId: 'consumable.cryo_binder', slot: null },
      { itemId: 'consumable.rivet_patch', slot: null },
    ]
    const quads = vehicleGearQuadsOf(art, vehicle, items, () => 0)
    expect(quads.filter((quad) => quad.partId === CRATE_RACK.shelfPartId)).toHaveLength(1)
    expect(quads.map((quad) => quad.partId).sort()).toEqual([
      'crate-cryo-binder',
      'crate-rivet-patch',
      'crate-shelf',
    ])
  })
})
