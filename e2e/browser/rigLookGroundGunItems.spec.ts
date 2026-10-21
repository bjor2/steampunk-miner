/**
 * The ground-gun items' own parts beside the rig look, in the browser (ticket 589; spec #576, GD
 * lock on #157): each owned Armoury item hangs its own `vehicle-item-weapon-*` asset on its gun,
 * the bore gun's at `hull.front` and the turret's at `hull.turret` (tickets 321, 388), keyed to
 * owning it and nothing else; every rig look at its highest leaves each module where it was, and
 * the modules leave the physics world and the looks as they were. Asserted through
 * `steampunkDebug`, never pixels; a shot of each item alone, and of all of them on the highest
 * look, at desktop and 360 px, is written to the test's output folder for review, never compared.
 */
import { expect, test, type Page } from '@playwright/test'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

interface ItemOnRig {
  itemId: string
  attachId: 'hull.front' | 'hull.turret'
  /** The item's own parts, sorted; the gilded plate shows only once Mastered (#310). */
  partIds: string[]
}

/** The sixteen items of the two Armoury lanes and where each rides (armouryMounts.json). */
const ITEMS: readonly ItemOnRig[] = [
  {
    itemId: 'weapon.gimbal_sight',
    attachId: 'hull.front',
    partIds: ['sight-gimbal', 'sight-scope'],
  },
  { itemId: 'weapon.steam_sear', attachId: 'hull.front', partIds: ['sear-block', 'sear-lever'] },
  { itemId: 'weapon.long_barrel', attachId: 'hull.front', partIds: ['barrel-sleeve'] },
  { itemId: 'weapon.rifled_bore', attachId: 'hull.front', partIds: ['rifled-jacket'] },
  { itemId: 'weapon.splay_choke', attachId: 'hull.front', partIds: ['splay-choke'] },
  { itemId: 'weapon.earthing_spike', attachId: 'hull.front', partIds: ['earthing-spike'] },
  { itemId: 'weapon.cementing_round', attachId: 'hull.front', partIds: ['cement-magazine'] },
  { itemId: 'weapon.strut_bore', attachId: 'hull.front', partIds: ['strut-rack'] },
  { itemId: 'weapon.fire_director', attachId: 'hull.turret', partIds: ['director-box'] },
  { itemId: 'weapon.sentry_cam', attachId: 'hull.turret', partIds: ['cam-follower', 'cam-wheel'] },
  { itemId: 'weapon.extended_barrels', attachId: 'hull.turret', partIds: ['barrel-extension'] },
  { itemId: 'weapon.grapeshot_breech', attachId: 'hull.turret', partIds: ['grapeshot-breech'] },
  { itemId: 'weapon.concussion_shells', attachId: 'hull.turret', partIds: ['concussion-box'] },
  { itemId: 'weapon.flushing_shell', attachId: 'hull.turret', partIds: ['flushing-cradle'] },
  { itemId: 'weapon.overpressure_burst', attachId: 'hull.turret', partIds: ['overpressure-tank'] },
  { itemId: 'weapon.ricochet_shot', attachId: 'hull.turret', partIds: ['ricochet-hopper'] },
]
/** One purchase past each track's top step (rigLook.json), so every look shows its top part. */
const HIGHEST_LOOK: Readonly<Record<string, number>> = {
  drill_power: 101,
  drill_tip: 281,
  engine: 27,
  boiler: 17,
  cargo_hold: 34,
  hull: 441,
}
/** The turret's first major level is ten minor steps (#180): `setGunLevel` takes steps. */
const TURRET_FIRST_LEVEL_STEPS = 10
const VIEWPORTS = [
  { name: 'desktop', size: { width: 1280, height: 720 } },
  { name: 'phone', size: { width: 360, height: 640 } },
]
const JPEG_QUALITY = 80
/** A module's atlas uploads after it is hung; the shot waits this long for it. */
const ART_SETTLE_MS = 1500

interface ModuleOnRig {
  assetId: string
  attachId: string
  partIds: string[]
}

const assetIdOf = (itemId: string): string =>
  `vehicle-item-${itemId.replaceAll('_', '-').replaceAll('.', '-')}`

const onRigOf = ({ itemId, attachId, partIds }: ItemOnRig): ModuleOnRig => ({
  assetId: assetIdOf(itemId),
  attachId,
  partIds,
})

const byAsset = (a: ModuleOnRig, b: ModuleOnRig): number => a.assetId.localeCompare(b.assetId)

async function openWithBothGuns(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate(
    ([zoom, turretSteps]) => {
      const debug = window.steampunkDebug!
      debug.ui.setZoom(zoom)
      const mounted = [
        debug.features['ground-gun'].setLevels(1, 1, 1),
        debug.setGunLevel(turretSteps),
      ]
      for (const result of mounted) if (!result.ok) throw new Error(result.problems.join('; '))
    },
    [VIEW_SHORT_AXIS_MIN_M, TURRET_FIRST_LEVEL_STEPS] as const,
  )
  return errors
}

function ownItems(page: Page, itemIds: readonly string[]): Promise<void> {
  return page.evaluate((owned) => {
    const result = window.steampunkDebug!.setVehicleLoadout({}, owned)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, itemIds)
}

function setHighestLooks(page: Page): Promise<void> {
  return page.evaluate((levels) => {
    for (const [track, level] of Object.entries(levels)) {
      const result = window.steampunkDebug!.setUpgrade(track, level)
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  }, HIGHEST_LOOK)
}

/** The Armoury modules hung on the rig now, each with its part ids sorted, by asset. */
function modulesOnRig(page: Page): Promise<ModuleOnRig[]> {
  return page
    .evaluate(() => {
      const parts = window.steampunkDebug!.vehicleParts()
      if (!parts.ok) throw new Error(parts.problems.join('; '))
      return parts.mounted
        .filter((mount) => mount.assetId.startsWith('vehicle-item-weapon-'))
        .map((mount) => ({ ...mount, partIds: [...mount.partIds].sort() }))
    })
    .then((modules) => modules.sort(byAsset))
}

function rigLooks(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['rig-look'].getLooks() as {
      ok: boolean
      looks?: unknown
    }
    if (!result.ok) throw new Error('the rig look read failed')
    return result.looks
  })
}

function physicsCounts(page: Page): Promise<{ rigidBodies: number; colliders: number }> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.getPhysicsStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return { rigidBodies: result.rigidBodies, colliders: result.colliders }
  })
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(ART_SETTLE_MS)
  await page.screenshot({
    path: test.info().outputPath(`${name}.jpg`),
    type: 'jpeg',
    quality: JPEG_QUALITY,
  })
}

const EVERY_ITEM = ITEMS.map((item) => item.itemId)
const EVERY_MODULE = ITEMS.map(onRigOf).sort(byAsset)

test.describe('ground-gun item parts beside the rig look (ticket 589)', () => {
  test('hangs each owned item alone on its gun, its own parts at its gun point', async ({
    page,
  }) => {
    const errors = await openWithBothGuns(page)
    expect(await modulesOnRig(page)).toEqual([])
    for (const item of ITEMS) {
      await ownItems(page, [item.itemId])
      await expect.poll(() => modulesOnRig(page), { message: item.itemId }).toEqual([onRigOf(item)])
    }
    await ownItems(page, [])
    await expect.poll(() => modulesOnRig(page)).toEqual([])
    expect(errors).toEqual([])
  })

  test('keeps every module where it hangs with every rig look at its highest', async ({ page }) => {
    const errors = await openWithBothGuns(page)
    await ownItems(page, EVERY_ITEM)
    await expect.poll(() => modulesOnRig(page)).toEqual(EVERY_MODULE)
    await setHighestLooks(page)
    await expect.poll(() => modulesOnRig(page)).toEqual(EVERY_MODULE)
    expect(errors).toEqual([])
  })

  test('leaves the looks, the bodies and the colliders as they were with every item', async ({
    page,
  }) => {
    const errors = await openWithBothGuns(page)
    await setHighestLooks(page)
    const looks = await rigLooks(page)
    const bodies = await physicsCounts(page)
    await ownItems(page, EVERY_ITEM)
    await expect.poll(() => modulesOnRig(page)).toEqual(EVERY_MODULE)
    expect(await rigLooks(page)).toEqual(looks)
    await expect.poll(() => physicsCounts(page)).toEqual(bodies)
    expect(errors).toEqual([])
  })

  for (const viewport of VIEWPORTS) {
    test(`shoots each item alone and every item on the highest look, ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport.size)
      const errors = await openWithBothGuns(page)
      await shoot(page, `ground-gun-items-none-${viewport.name}`)
      for (const item of ITEMS) {
        await ownItems(page, [item.itemId])
        await expect.poll(() => modulesOnRig(page)).toEqual([onRigOf(item)])
        await shoot(page, `ground-gun-item-${assetIdOf(item.itemId)}-${viewport.name}`)
      }
      await ownItems(page, EVERY_ITEM)
      await setHighestLooks(page)
      await expect.poll(() => modulesOnRig(page)).toEqual(EVERY_MODULE)
      await shoot(page, `ground-gun-items-every-highest-look-${viewport.name}`)
      expect(errors).toEqual([])
    })
  }
})
