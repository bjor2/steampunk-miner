import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import type { SliceDefinition } from '../../../../registries/sliceDefinition'
import { blenderAssetIds, isValidPartId, slotItemAssetIdOf } from '../../../../systems/art/artIds'
import { exportedSidecarOf, placeholderSidecarOf } from '../../../../systems/art/artCatalogue'
import { assetQuadsOf } from '../../../../systems/art/assetLook'
import type { Pair } from '../../../../systems/art/partsSidecar'
import { ATTACH_ASSET_ID, attachIdsOf } from '../../../../systems/art/sidecarAttach'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import {
  attachCoverageProblems,
  type AttachedItem,
} from '../../../../systems/registries/attachCoverage'
import { isAttachId } from '../../../../systems/registries/vehicleAttach'
import type { LoadoutSlotId } from '../../../../systems/registries/vehicleLoadout'
import { isMovingPart } from './extractorPose'
import { mountedGearQuadsOf } from './techGearQuads'
import {
  CRATE_RACK,
  GAUGE_CLUSTER,
  MOUNTED_GEAR,
  POWER_UP_FX,
  gearAssetIds,
  gearPartIdsOf,
  isOwnGearAsset,
  mountedGearOf,
  techGearArtAssets,
  type GearKind,
  type MountedGear,
} from './techGear'

// The #162 catalogue's physical rows (section 5 "Mounted parts"): every extractor, drill gear,
// power-up with a part or a slot housing, passive and consumable crate has a model (#166).
const PHYSICAL_ITEM_IDS = [
  'rig.resonance',
  'rig.containment',
  'rig.acid_etcher',
  'rig.induction',
  'rig.aether_tether',
  'gear.vibratory_bit',
  'gear.thaw_crown',
  'gear.twin_bit',
  'gear.dielectric_bit',
  'gear.spoil_auger',
  'gear.sampling_corer',
  'gear.reach_boom',
  'gear.side_cutters',
  'power.grapple_winch',
  'power.echo_sounder',
  'passive.threat_periscope',
  'passive.assay_lens',
  'passive.hazard_barometer',
  'power.mineral_drain',
  'power.slurry_siphon',
  'power.ore_shifter',
  'power.pressure_pocket',
  'power.strata_press',
  'power.galvanic_probe',
  'power.void_sounder',
  'power.steam_boost',
  'power.steam_shield',
  'power.grav_anchor',
  'power.buoyancy_tanks',
  'consumable.flare_mortar',
  'consumable.stabiliser_foam',
  'consumable.seam_splitter',
  'consumable.cryo_binder',
  'consumable.lodestone_beacon',
  'consumable.shoring_props',
  'consumable.signal_buoy',
  'consumable.emergency_ballast',
  'consumable.heat_sink_flask',
  'consumable.rivet_patch',
  'consumable.smoke_canister',
  'consumable.escape_thruster',
]

/** The loadout slots each kind can sit in (#162 TD lock and amendments). */
const SLOTS_OF_KIND: Readonly<Record<GearKind, readonly LoadoutSlotId[]>> = {
  extractor: [],
  passive: [],
  gauge: [],
  head: ['drill.head'],
  collar: ['drill.collar'],
  flank: ['drill.flank'],
  signature: ['powerup.1', 'powerup.2', 'powerup.3', 'powerup.4', 'powerup.5'],
  slot: ['powerup.1', 'powerup.2', 'powerup.3', 'powerup.4', 'powerup.5'],
  crate: ['powerup.1', 'powerup.2', 'powerup.3', 'powerup.4', 'powerup.5'],
}

const gearSlice: SliceDefinition = {
  id: 'tech-tree',
  register: (r) => r.artAssets(techGearArtAssets()),
}

const asAttachedItem = (gear: MountedGear): AttachedItem => ({
  id: gear.itemId,
  slots: SLOTS_OF_KIND[gear.kind],
  attach: gear.attach,
})

const vehicleSidecars = () =>
  [
    placeholderSidecarOf(SHIPPED_ART, ATTACH_ASSET_ID),
    exportedSidecarOf(SHIPPED_ART, ATTACH_ASSET_ID),
  ].flatMap((sidecar) => (sidecar === null ? [] : [sidecar]))

describe('tech gear: the mounted gear table', () => {
  it('gives every physical item of the #162 catalogue a model, and nothing else', () => {
    expect(MOUNTED_GEAR.map((gear) => gear.itemId).sort()).toEqual([...PHYSICAL_ITEM_IDS].sort())
  })

  it('names a locked attach id for every item, and "slot" only for slot housings', () => {
    for (const gear of MOUNTED_GEAR) {
      const problem = { item: gear.itemId, ok: gear.attach === 'slot' || isAttachId(gear.attach) }
      expect(problem).toEqual({ item: gear.itemId, ok: true })
      expect(gear.attach === 'slot').toBe(gear.kind === 'slot')
    }
  })

  it('keeps the TD coverage rule against both vehicle sidecars, extractors always mounted', () => {
    const sidecars = vehicleSidecars()
    expect(sidecars).toHaveLength(2)
    for (const sidecar of sidecars) {
      expect(
        attachCoverageProblems(MOUNTED_GEAR.map(asAttachedItem), attachIdsOf(sidecar)),
      ).toEqual([])
    }
  })

  it('names each own asset after the kernel slot-model rule and the two clusters by their own ids', () => {
    for (const gear of MOUNTED_GEAR) {
      const expected = isOwnGearAsset(gear)
        ? slotItemAssetIdOf(gear.itemId)
        : gear.kind === 'gauge'
          ? GAUGE_CLUSTER.assetId
          : CRATE_RACK.assetId
      expect({ item: gear.itemId, asset: gear.assetId }).toEqual({
        item: gear.itemId,
        asset: expected,
      })
    }
  })

  it('gives every extractor a part that folds and deploys, and a cap colour', () => {
    const extractors = MOUNTED_GEAR.filter((gear) => gear.kind === 'extractor')
    expect(extractors).toHaveLength(5)
    for (const gear of extractors) {
      expect(gear.parts.some(isMovingPart)).toBe(true)
      expect(gear.capColour).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('mirrors the side cutters about the drill axis and nothing else', () => {
    expect(MOUNTED_GEAR.filter((gear) => gear.mirrored).map((gear) => gear.itemId)).toEqual([
      'gear.side_cutters',
    ])
  })

  it('puts every consumable crate and the mortar tube on the rack shelves, one shelf part', () => {
    const crates = MOUNTED_GEAR.filter((gear) => gear.kind === 'crate')
    expect(crates).toHaveLength(12)
    expect(crates.every((gear) => gear.attach === 'hull.rear')).toBe(true)
    expect(crates.every((gear) => gear.parts[0]?.id === CRATE_RACK.shelfPartId)).toBe(true)
    expect(CRATE_RACK.columns * CRATE_RACK.rows).toBe(12)
    expect(gearPartIdsOf(CRATE_RACK.assetId)).toContain('mortar-tube')
  })

  it('shares one gauge cluster between the assay lens and the barometer, a dial each', () => {
    expect(gearPartIdsOf(GAUGE_CLUSTER.assetId)).toEqual([
      'dial-assay-lens',
      'dial-hazard-barometer',
      'gauge-cluster',
    ])
  })

  it('registers every gear asset under the vehicle category with its parts', () => {
    withRegistrations([gearSlice], () => {
      for (const assetId of gearAssetIds()) {
        expect(blenderAssetIds()).toContain(assetId)
        for (const partId of gearPartIdsOf(assetId)) {
          expect({ assetId, partId, valid: isValidPartId(assetId, partId) }).toEqual({
            assetId,
            partId,
            valid: true,
          })
        }
      }
    })
  })

  it('looks an item up by id', () => {
    expect(mountedGearOf('rig.resonance')?.attach).toBe('drill.fork')
    expect(mountedGearOf('slot.powerup_3')).toBeNull()
  })

  it('shapes every effect the spec lists, each on a catalogue item or twist', () => {
    const itemIds = POWER_UP_FX.map((fx) => fx.itemId)
    expect(itemIds).toEqual(expect.arrayContaining(['power.mineral_drain', 'power.ore_shifter']))
    expect(itemIds).toEqual(expect.arrayContaining(['consumable.lodestone_beacon']))
    expect(itemIds).toEqual(expect.arrayContaining(['power.echo_sounder', 'power.void_sounder']))
    expect(itemIds).toEqual(expect.arrayContaining(['artefact.seismic_ping', 'power.steam_boost']))
    expect(itemIds).toEqual(
      expect.arrayContaining(['consumable.flare_mortar', 'power.steam_shield']),
    )
    expect(itemIds).toEqual(
      expect.arrayContaining(['artefact.grapple_anchor', 'power.slurry_siphon']),
    )
    expect(itemIds).toEqual(
      expect.arrayContaining(['artefact.salvage_magnet', 'consumable.stabiliser_foam']),
    )
    expect(new Set(POWER_UP_FX.map((fx) => fx.id)).size).toBe(POWER_UP_FX.length)
  })
})

// The G&V silhouette rule (#162 feel pass, GD approved): with all five extractors owned and
// folded, the vehicle's silhouette in normal digging stays within 110% of its no-extractor area.
// Measured on the exported sidecars' part rectangles, rasterised at a centimetre: a bounding
// rectangle overstates a part, so a pass here is conservative.
describe('tech gear: the folded silhouette', () => {
  const CELL_M = 0.01
  const TOP_TIER = 3

  function rectsOf(quads: readonly { centre: Pair; size: Pair }[]): number[][] {
    return quads.map(({ centre, size }) => [
      centre[0] - size[0] / 2,
      centre[1] - size[1] / 2,
      centre[0] + size[0] / 2,
      centre[1] + size[1] / 2,
    ])
  }

  function unionAreaOf(rects: readonly number[][]): number {
    const cells = new Set<string>()
    for (const [left, bottom, right, top] of rects) {
      for (let x = Math.floor(left / CELL_M); x < Math.ceil(right / CELL_M); x += 1) {
        for (let y = Math.floor(bottom / CELL_M); y < Math.ceil(top / CELL_M); y += 1) {
          cells.add(`${x},${y}`)
        }
      }
    }
    return cells.size
  }

  it('keeps the five folded extractors within 110% of the bare tier-3 vehicle', () => {
    const vehicle = exportedSidecarOf(SHIPPED_ART, ATTACH_ASSET_ID)
    expect(vehicle).not.toBeNull()
    if (vehicle === null) return
    const bare = rectsOf(assetQuadsOf(SHIPPED_ART, ATTACH_ASSET_ID, TOP_TIER))
    const folded = MOUNTED_GEAR.filter((gear) => gear.kind === 'extractor').flatMap((gear) =>
      rectsOf(mountedGearQuadsOf(SHIPPED_ART, vehicle, { itemId: gear.itemId, slot: null }, 0)),
    )
    expect(folded.length).toBe(10)
    const ratio = unionAreaOf([...bare, ...folded]) / unionAreaOf(bare)
    expect(ratio).toBeLessThanOrEqual(1.1)
  })
})
