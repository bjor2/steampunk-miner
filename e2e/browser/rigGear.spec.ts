/**
 * The #166 gear on the rig in the preview build (ticket 250): owned mobility items hang at their
 * attach points through the tech tree's vehicle piece, unowned and still-invisible items do not,
 * each cradle shows a Mark 1 plate (nothing researched, so the items act as bought), and raising the steam shield starts its curtain effect.
 * Asserted through `steampunkDebug.vehicleParts().mounted` and the slice's `getRig()`, never
 * pixels; the shot of the loaded rig is written to the test's output folder for review, never
 * compared.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const SHIELD = 'power.steam_shield'
const WINCH = 'power.grapple_winch'
const RIVET_PATCH = 'consumable.rivet_patch'

/** What the rig hangs for the shield and winch in the cradles and a rivet patch on the rack. */
const MOUNTED = [
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
    partIds: ['crate-rivet-patch', 'crate-shelf'],
  },
]
/** Owned by nobody here, or still a vision row: never on the car. */
const ABSENT_ASSETS = [
  'vehicle-item-power-steam-boost',
  'vehicle-item-power-echo-sounder',
  'vehicle-item-gear-twin-bit',
]
const JPEG_QUALITY = 80
/** The gear's atlases upload after the mount; the shot waits this long for them. */
const ART_SETTLE_MS = 3000

interface RigRead {
  ok: boolean
  plates?: { slot: string; mark: number; isGilded: boolean }[]
  fx?: { isDrawn: boolean; started: number; active: string[] }
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function loadShieldWinchAndPatch(page: Page) {
  return page.evaluate(
    ([shield, winch, patch]) =>
      window.steampunkDebug!.setVehicleLoadout({ 'powerup.1': shield!, 'powerup.2': winch! }, [
        patch!,
      ]),
    [SHIELD, WINCH, RIVET_PATCH],
  )
}

async function mountedParts(page: Page) {
  const mounted = await page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleParts()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.mounted
  })
  return mounted.map((mount) => ({ ...mount, partIds: [...mount.partIds].sort() }))
}

function readRig(page: Page): Promise<RigRead> {
  return page.evaluate(() => window.steampunkDebug!.features['tech-tree']!.getRig!() as RigRead)
}

test.describe('the rig gear (ticket 250)', () => {
  test('hangs the owned mobility items on the car, and nothing it does not own', async ({
    page,
  }) => {
    const errors = await openGame(page)
    expect(await mountedParts(page)).toEqual([])

    expect(await loadShieldWinchAndPatch(page)).toEqual({ ok: true })
    await expect.poll(() => mountedParts(page)).toEqual(MOUNTED)
    const assets = (await mountedParts(page)).map((mount) => mount.assetId)
    for (const absent of ABSENT_ASSETS) expect(assets).not.toContain(absent)
    expect((await readRig(page)).plates).toEqual([
      expect.objectContaining({ slot: 'powerup.1', mark: 1, isGilded: false }),
      expect.objectContaining({ slot: 'powerup.2', mark: 1, isGilded: false }),
    ])

    await page.keyboard.press('KeyX')
    await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_MIN_M)
    await page.waitForTimeout(ART_SETTLE_MS)
    await page.screenshot({
      path: test.info().outputPath('rig-gear-mobility.jpg'),
      type: 'jpeg',
      quality: JPEG_QUALITY,
    })
    expect(errors).toEqual([])
  })

  test('raising the steam shield starts its curtain in the effects layer', async ({ page }) => {
    const errors = await openGame(page)
    expect(await loadShieldWinchAndPatch(page)).toEqual({ ok: true })
    await page.evaluate(() => window.steampunkDebug!.input.tap('use_slot_1'))
    await expect.poll(async () => (await readRig(page)).fx?.started ?? 0).toBeGreaterThanOrEqual(1)
    expect(errors).toEqual([])
  })
})
