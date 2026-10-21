/**
 * The drill tip's rig looks in the browser (ticket 579): from 70 purchases each step of
 * `rigLook.json` swaps its part of `vehicle-look-drill-tip` onto the drill head in place of the
 * rig's bit, the tail keeps the top part, and the look leaves the physics world as it was; the
 * drill tip plaque names the owned step and grades the tail (#585's template).
 * Asserted through `steampunkDebug`, never pixels; the shots at every step and two tail points,
 * desktop and 360 px, by the rig's tier 1 and tier 3 shape, are written to the test's output
 * folder for review, never compared.
 */
import { expect, test, type Page } from '@playwright/test'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'
import type { DebugApi } from '../../src/debug/debugApi'
import { WORKSHOP_TEST_IDS } from '../../src/features/workshop/ui/testIds'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const ASSET_ID = 'vehicle-look-drill-tip'
/** The bare rig, Systems' five steps (#157 comment 6300543785), then two tail points. */
const LOOKS = [
  { purchases: 69, part: null, fitting: null },
  { purchases: 70, part: 'steel-cone', fitting: 'Fitting: Steel cone' },
  { purchases: 100, part: 'fluted-bit', fitting: 'Fitting: Fluted bit' },
  { purchases: 130, part: 'toothed-crown', fitting: 'Fitting: Toothed crown' },
  { purchases: 190, part: 'gem-set-crown', fitting: 'Fitting: Gem-set crown' },
  { purchases: 280, part: 'aether-cut-crown', fitting: 'Fitting: Aether-cut crown' },
  { purchases: 281, part: 'aether-cut-crown', fitting: 'Fitting: Aether-cut crown · Grade 1' },
  { purchases: 282, part: 'aether-cut-crown', fitting: 'Fitting: Aether-cut crown · Grade 2' },
]
/** The tail grades the plaque must fit at 360 px (VS on #579): in full to 9999, then cut. */
const TAIL_GRADES = [1, 101, 9_999, 1_000_000]
const TOP_STEP = 280
const FITTING = `[data-testid="${WORKSHOP_TEST_IDS.plaqueFitting('drill_tip')}"]`
const PLAQUE = '[data-plaque="drill_tip"]'
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

async function openAtTheWorkshop(page: Page): Promise<string[]> {
  const errors = await openGame(page)
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    for (const result of [debug.giveMoney('1e9'), debug.teleportToDock('upgrade')]) {
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  })
  await expect(page.locator(PLAQUE)).toBeAttached({ timeout: 60_000 })
  return errors
}

/** How far the fitting fact runs past its plaque's right edge, in CSS pixels (0: inside it). */
async function fittingOverflowOf(page: Page): Promise<number> {
  const plaque = await page.locator(PLAQUE).boundingBox()
  const fitting = await page.locator(FITTING).boundingBox()
  if (plaque === null || fitting === null) throw new Error('the drill tip plaque is not laid out')
  return Math.max(0, fitting.x + fitting.width - (plaque.x + plaque.width))
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
    test(`names the owned step on the plaque and grades the tail, ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport.size)
      const errors = await openAtTheWorkshop(page)
      for (const { purchases, fitting } of LOOKS) {
        await setUpgrade(page, 'drill_tip', purchases)
        if (fitting === null) await expect(page.locator(FITTING)).toHaveCount(0)
        else await expect(page.locator(FITTING)).toHaveText(fitting)
      }
      for (const grade of TAIL_GRADES) {
        await setUpgrade(page, 'drill_tip', TOP_STEP + grade)
        await expect(page.locator(FITTING)).toContainText('· Grade ')
        await page.locator(PLAQUE).scrollIntoViewIfNeeded()
        expect(await fittingOverflowOf(page), `grade ${grade}`).toBeLessThanOrEqual(1)
        await test.info().attach(`drill tip grade ${grade}, ${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
      expect(errors).toEqual([])
    })

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
