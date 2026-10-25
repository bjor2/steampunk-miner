/**
 * The coal tender's look steps in the browser (tickets 813 and 874, LK5 and LK11 of spec #647; the
 * ladder of ticket 758): the kernel piece hangs one `vehicle-fuel-tank` wagon at `hull.hitch` for
 * the tank's level, the #758 wagons at levels 1, 2, 3 and 5, the LK5 parts fitted on the guild
 * tender at 6, 7 and 8 and the LK11 fittings at 9 to 18, one step a purchase (the tender is exempt
 * from the decade rule); past the top step the finish tail keeps the top wagon, and the look leaves
 * the physics world as it was. The tank is bought
 * level by level at the Sell bay through the authority, so the spec plays what a player does.
 * Asserted through `steampunkDebug`, never pixels; the shots at every level and two finish bands,
 * desktop and 360 px, by the rig's tier 1 and tier 3 shape, are written to the test's output
 * folder for review, never compared.
 */
import { expect, test, type Page } from '@playwright/test'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'
import type { DebugApi } from '../../src/debug/debugApi'
import type { ScriptedCommand } from '../../src/systems/fastForward'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const ASSET_ID = 'vehicle-fuel-tank'
const HITCH = 'hull.hitch'
/** The wagon each tank level shows (`fuelTender.json`): the steps, then two finish bands. */
const LOOKS = [
  { level: 1, part: 'coal-cart' },
  { level: 2, part: 'bunker-tender' },
  { level: 3, part: 'riveted-tender' },
  { level: 4, part: 'riveted-tender' },
  { level: 5, part: 'guild-tender' },
  { level: 6, part: 'twin-tank-tender' },
  { level: 7, part: 'hopper-tender' },
  { level: 8, part: 'glass-tank-tender' },
  { level: 9, part: 'tooled-tender' },
  { level: 10, part: 'plated-tender' },
  { level: 11, part: 'lamped-tender' },
  { level: 12, part: 'piped-tender' },
  { level: 13, part: 'gauged-tender' },
  { level: 14, part: 'sprung-tender' },
  { level: 15, part: 'guarded-tender' },
  { level: 16, part: 'screened-tender' },
  { level: 17, part: 'aether-tank-tender' },
  { level: 18, part: 'aether-coil-tender' },
  { level: 19, part: 'aether-coil-tender' },
  { level: 20, part: 'aether-coil-tender' },
]
const TOP_LEVEL = LOOKS[LOOKS.length - 1].level
const VIEWPORTS = [
  { name: 'desktop', size: { width: 1280, height: 720 } },
  { name: 'phone', size: { width: 360, height: 640 } },
]
/** The rig's tier counts majors over every track (#20): 200 drill power puts the wagon behind the tier-3 rig. */
const RIG_SHAPES = [
  { name: 'tier-1', drillPower: 0 },
  { name: 'tier-3', drillPower: 200 },
]
const JPEG_QUALITY = 80
/** The wagon's atlas uploads after the swap; the shot waits this long for it. */
const ART_SETTLE_MS = 1500
/** Ticks between two tank purchases in the script: one is enough, the bay answers each at once. */
const TICKS_A_PURCHASE = 2

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_MIN_M)
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    for (const result of [debug.giveMoney('1e30'), debug.teleportToDock('sell')]) {
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  })
  return errors
}

/** Buys one tank level at the Sell bay through the authority, on exact ticks. */
function buyOneTankLevel(page: Page): Promise<void> {
  return page.evaluate((ticksApart) => {
    const debug = window.steampunkDebug!
    const snapshot = debug.snapshot()
    if (!snapshot.ok) throw new Error('no snapshot')
    const tick = snapshot.snapshot.tick + 1
    const buy = { tick, type: 'buyFuelTank', payload: {} } as unknown as ScriptedCommand
    const played = debug.fastForward(ticksApart, [buy])
    if (!played.ok) throw new Error(played.problems.join('; '))
  }, TICKS_A_PURCHASE)
}

function setUpgrade(page: Page, track: string, purchases: number): Promise<void> {
  return page.evaluate(
    ([upgradeId, level]) => {
      const result = window.steampunkDebug!.setUpgrade(upgradeId, level as number)
      if (!result.ok) throw new Error(result.problems.join('; '))
    },
    [track, purchases] as const,
  )
}

/** The wagon parts hung at the hitch now. */
function wagonParts(page: Page): Promise<string[]> {
  return page.evaluate(
    ([assetId, attachId]) => {
      const result = window.steampunkDebug!.vehicleParts()
      if (!result.ok) throw new Error(result.problems.join('; '))
      return result.mounted
        .filter((mount) => mount.assetId === assetId && mount.attachId === attachId)
        .flatMap((mount) => mount.partIds)
    },
    [ASSET_ID, HITCH] as const,
  )
}

function physicsCounts(page: Page): Promise<{ rigidBodies: number; colliders: number }> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.getPhysicsStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return { rigidBodies: result.rigidBodies, colliders: result.colliders }
  })
}

async function expectWagon(page: Page, part: string): Promise<void> {
  await expect.poll(() => wagonParts(page)).toEqual([part])
}

/** Plays the ladder from the starting tank, calling `onEach` once the level's wagon hangs. */
async function climbTheLadder(
  page: Page,
  onEach: (look: { level: number; part: string }) => Promise<void>,
): Promise<void> {
  for (const look of LOOKS) {
    if (look.level > 1) await buyOneTankLevel(page)
    await expectWagon(page, look.part)
    await onEach(look)
  }
}

test.describe('coal tender look (tickets 813, 874)', () => {
  test('hangs one wagon a tank level, the LK5 and LK11 parts one purchase apart, the top wagon past the art', async ({
    page,
  }) => {
    const errors = await openGame(page)
    await climbTheLadder(page, async () => undefined)
    expect(errors).toEqual([])
  })

  test('keeps the same bodies and colliders at the lowest and the highest look', async ({
    page,
  }) => {
    const errors = await openGame(page)
    await expectWagon(page, LOOKS[0].part)
    const lowest = await physicsCounts(page)
    for (let level = 2; level <= TOP_LEVEL; level++) await buyOneTankLevel(page)
    await expectWagon(page, LOOKS[LOOKS.length - 1].part)
    await expect.poll(() => physicsCounts(page)).toEqual(lowest)
    expect(errors).toEqual([])
  })

  for (const viewport of VIEWPORTS) {
    test(`shoots every level and two finish bands at ${viewport.name} size`, async ({ page }) => {
      await page.setViewportSize(viewport.size)
      for (const shape of RIG_SHAPES) {
        const errors = await openGame(page)
        await setUpgrade(page, 'drill_power', shape.drillPower)
        await climbTheLadder(page, async ({ level }) => {
          await page.waitForTimeout(ART_SETTLE_MS)
          await page.screenshot({
            path: test
              .info()
              .outputPath(`fuel-tender-${shape.name}-level-${level}-${viewport.name}.jpg`),
            type: 'jpeg',
            quality: JPEG_QUALITY,
          })
        })
        expect(errors).toEqual([])
      }
    })
  }
})
