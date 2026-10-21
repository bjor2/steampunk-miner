/**
 * The drill tip's rig looks in the browser (ticket 579): from 70 purchases each step of
 * `rigLook.json` swaps its part of `vehicle-look-drill-tip` onto the drill head in place of the
 * rig's bit, the tail keeps the top part, and the look leaves the physics world as it was.
 * Asserted through `steampunkDebug`, never pixels; the shots at every step and two tail points,
 * desktop and 360 px, by the rig's tier 1 and tier 3 shape, are written to the test's output
 * folder for review, never compared.
 */
import { expect, test, type Page } from '@playwright/test'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const ASSET_ID = 'vehicle-look-drill-tip'
/** The bare rig, Systems' five steps (#157 comment 6300543785), then two tail points. */
const LOOKS = [
  { purchases: 69, part: null },
  { purchases: 70, part: 'steel-cone' },
  { purchases: 100, part: 'fluted-bit' },
  { purchases: 130, part: 'toothed-crown' },
  { purchases: 190, part: 'gem-set-crown' },
  { purchases: 280, part: 'aether-cut-crown' },
  { purchases: 281, part: 'aether-cut-crown' },
  { purchases: 282, part: 'aether-cut-crown' },
]
const VIEWPORTS = [
  { name: 'desktop', size: { width: 1280, height: 720 } },
  { name: 'phone', size: { width: 360, height: 640 } },
]
/**
 * The rig's tier counts majors over every track (#20): the tip alone is tier 1 below 80 purchases,
 * tier 2 to 199, tier 3 from 200; 130 drill power puts every look on the tier-3 rig, as in play.
 */
const RIG_SHAPES = [
  { name: 'tip-only', drillPower: 0 },
  { name: 'tier-3', drillPower: 130 },
]
const JPEG_QUALITY = 80
/** The look's atlas uploads after the swap; the shot waits this long for it. */
const ART_SETTLE_MS = 1500

interface TipParts {
  partIds: string[]
  lookPartIds: string[]
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_MIN_M)
  return errors
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

function tipParts(page: Page): Promise<TipParts> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleParts()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return { partIds: result.partIds, lookPartIds: result.lookPartIds }
  })
}

function physicsCounts(page: Page): Promise<{ rigidBodies: number; colliders: number }> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.getPhysicsStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return { rigidBodies: result.rigidBodies, colliders: result.colliders }
  })
}

const isDrillBit = (partId: string): boolean => /^t\d+-drill-bit$/.test(partId)

async function expectLook(page: Page, part: string | null): Promise<void> {
  const expected = part === null ? [] : [`${ASSET_ID}/${part}`]
  await expect.poll(async () => (await tipParts(page)).lookPartIds).toEqual(expected)
  const bits = (await tipParts(page)).partIds.filter(isDrillBit)
  if (part === null) expect(bits.length).toBe(1)
  else expect(bits).toEqual([])
}

test.describe('drill tip look (ticket 579)', () => {
  test('swaps each step onto the head in place of the bit, the top part on the tail', async ({
    page,
  }) => {
    const errors = await openGame(page)
    for (const { purchases, part } of LOOKS) {
      await setUpgrade(page, 'drill_tip', purchases)
      await expectLook(page, part)
    }
    expect(errors).toEqual([])
  })

  test('keeps the same bodies and colliders at the lowest and the highest look', async ({
    page,
  }) => {
    const errors = await openGame(page)
    await setUpgrade(page, 'drill_tip', 69)
    await expectLook(page, null)
    const lowest = await physicsCounts(page)
    await setUpgrade(page, 'drill_tip', 282)
    await expectLook(page, 'aether-cut-crown')
    await expect.poll(() => physicsCounts(page)).toEqual(lowest)
    expect(errors).toEqual([])
  })

  for (const viewport of VIEWPORTS) {
    test(`shoots every step and two tail points at ${viewport.name} size`, async ({ page }) => {
      await page.setViewportSize(viewport.size)
      const errors = await openGame(page)
      for (const shape of RIG_SHAPES) {
        await setUpgrade(page, 'drill_power', shape.drillPower)
        for (const { purchases, part } of LOOKS) {
          await setUpgrade(page, 'drill_tip', purchases)
          await expectLook(page, part)
          await page.waitForTimeout(ART_SETTLE_MS)
          await page.screenshot({
            path: test
              .info()
              .outputPath(`drill-tip-${shape.name}-${purchases}-${viewport.name}.jpg`),
            type: 'jpeg',
            quality: JPEG_QUALITY,
          })
        }
      }
      expect(errors).toEqual([])
    })
  }
})
