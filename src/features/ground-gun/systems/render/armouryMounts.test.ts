import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { exportedSidecarOf } from '../../../../systems/art/artCatalogue'
import { blenderAssetIds, slotItemAssetIdOf } from '../../../../systems/art/artIds'
import type { AssetQuad } from '../../../../systems/art/assetLook'
import { slice } from '../../register'
import { AUTO_GUNS_MODULES } from '../autoGunsLane'
import { STEAM_SEAR_ITEM_ID } from '../../../../systems/authority/bore/boreFire'
import { BORE_GUN_MODULES, LONG_BARREL_ITEM_ID, SPLAY_CHOKE_ITEM_ID } from '../boreGunLane'
import {
  ARMOURY_MODULE_MOUNTS,
  armouryArtAssets,
  armouryMountOf,
  barrelTipOf,
  GILDED_PLATE_PART_ID,
  moduleItemIdsOn,
  moduleQuadsOf,
  type BoughtModule,
} from './armouryMounts'

const FIRE_DIRECTOR = 'weapon.fire_director'
const EXTENDED_BARRELS = 'weapon.extended_barrels'
const GRAPESHOT_BREECH = 'weapon.grapeshot_breech'
/** The long barrel's sleeve runs this far past the crown, and the muzzle modules with it. */
const SLEEVE_REACH_M = 0.23

function bought(itemId: string, isMastered = false): BoughtModule {
  return { itemId, isMastered }
}

function partIdsOf(quads: readonly AssetQuad[]): string[] {
  return quads.map((quad) => quad.partId).sort()
}

function pivotOf(quads: readonly AssetQuad[], partId: string): readonly number[] {
  const quad = quads.find((candidate) => candidate.partId === partId)
  if (quad === undefined) throw new Error(`no part ${partId}`)
  return quad.pivot
}

describe('armoury module mounts (ticket 321)', () => {
  it('gives every module of both Armoury lanes a mount on its own gun', () => {
    const bore = BORE_GUN_MODULES.map((module) => [module.itemId, `bore.${module.mount}`])
    const turret = AUTO_GUNS_MODULES.map((module) => [module.itemId, `turret.${module.mount}`])
    const mounts = ARMOURY_MODULE_MOUNTS.map((module) => [module.itemId, module.mount])
    expect(mounts.sort()).toEqual([...bore, ...turret].sort())
    expect(moduleItemIdsOn('bore')).toHaveLength(BORE_GUN_MODULES.length)
    expect(moduleItemIdsOn('turret')).toHaveLength(AUTO_GUNS_MODULES.length)
  })

  it('registers each module asset with exactly the parts its export ships', () => {
    for (const asset of armouryArtAssets()) {
      const exported = exportedSidecarOf(SHIPPED_ART, asset.id)?.parts.map((part) => part.id)
      expect([...(exported ?? [])].sort()).toEqual([...(asset.parts ?? [])].sort())
      expect(asset.parts).toContain(GILDED_PLATE_PART_ID)
    }
    expect(withRegistrations([slice], blenderAssetIds)).toEqual(
      expect.arrayContaining(armouryArtAssets().map((asset) => asset.id)),
    )
  })

  it('draws nothing for a gun with no module bought', () => {
    expect(moduleQuadsOf(SHIPPED_ART, 'bore', [])).toEqual({ barrel: [], head: [] })
  })

  it('hangs a bought bore module on the barrel at its mount, its plate hidden until Mastered', () => {
    const asBought = moduleQuadsOf(SHIPPED_ART, 'bore', [bought(STEAM_SEAR_ITEM_ID)])
    expect(partIdsOf(asBought.barrel)).toEqual(['sear-block', 'sear-lever'])
    expect(asBought.head).toEqual([])
    expect(pivotOf(asBought.barrel, 'sear-block')[0]).toBeCloseTo(
      armouryMountOf(STEAM_SEAR_ITEM_ID)?.atM[0] ?? Number.NaN,
      3,
    )
    const mastered = moduleQuadsOf(SHIPPED_ART, 'bore', [bought(STEAM_SEAR_ITEM_ID, true)])
    expect(partIdsOf(mastered.barrel)).toEqual([GILDED_PLATE_PART_ID, 'sear-block', 'sear-lever'])
  })

  it("moves the muzzle modules out to the long barrel's end once the long barrel is bought", () => {
    const chokeX = (modules: BoughtModule[]) =>
      pivotOf(moduleQuadsOf(SHIPPED_ART, 'bore', modules).barrel, 'splay-choke')[0]
    const bare = chokeX([bought(SPLAY_CHOKE_ITEM_ID)])
    const lengthened = chokeX([bought(SPLAY_CHOKE_ITEM_ID), bought(LONG_BARREL_ITEM_ID)])
    expect(lengthened - bare).toBeCloseTo(SLEEVE_REACH_M, 6)
  })

  it('keeps each module on its own gun', () => {
    const both = [bought(STEAM_SEAR_ITEM_ID), bought(FIRE_DIRECTOR)]
    expect(partIdsOf(moduleQuadsOf(SHIPPED_ART, 'bore', both).barrel)).toEqual([
      'sear-block',
      'sear-lever',
    ])
    expect(partIdsOf(moduleQuadsOf(SHIPPED_ART, 'turret', both).head)).toEqual(['director-box'])
  })

  it('turns turret barrel modules with the barrel and leaves cupola modules on the head', () => {
    const quads = moduleQuadsOf(SHIPPED_ART, 'turret', [
      bought(GRAPESHOT_BREECH),
      bought(FIRE_DIRECTOR),
    ])
    expect(partIdsOf(quads.barrel)).toEqual(['grapeshot-breech'])
    expect(partIdsOf(quads.head)).toEqual(['director-box'])
  })

  it("puts the extended barrels on the turret barrel's tip, wherever the barrel look ends", () => {
    const extensionAt = (muzzleX: number) =>
      pivotOf(
        moduleQuadsOf(SHIPPED_ART, 'turret', [bought(EXTENDED_BARRELS)], muzzleX).barrel,
        'barrel-extension',
      )[0]
    expect(extensionAt(-0.4) - extensionAt(-0.3)).toBeCloseTo(-0.1, 6)
  })

  it("finds a rear-facing barrel's tip at its leftmost edge", () => {
    const quad = (centreX: number, width: number): AssetQuad => ({
      partId: 't1-gun-barrel',
      centre: [centreX, 0],
      pivot: [0, 0],
      size: [width, 0.07],
      z: 11,
      colour: '#000000',
      uv: null,
    })
    expect(barrelTipOf([quad(-0.13, 0.34)])).toBeCloseTo(-0.3, 6)
  })

  it('never draws a module with no mount row', () => {
    expect(armouryMountOf('weapon.unmounted')).toBeNull()
    expect(moduleQuadsOf(SHIPPED_ART, 'turret', [bought('weapon.unmounted', true)])).toEqual({
      barrel: [],
      head: [],
    })
  })

  it('names each asset by the vehicle-item rule, so a module is found by its item id', () => {
    expect(armouryArtAssets().map((asset) => asset.id)).toEqual(
      ARMOURY_MODULE_MOUNTS.map((module) => slotItemAssetIdOf(module.itemId)),
    )
  })
})
