/**
 * The cargo hold's rig looks in the browser (ticket 581): from 23 purchases each step of
 * `rigLook.json` swaps its part of `vehicle-look-cargo-hold` onto `hull.cargo` in place of the
 * rig's ore hatch (`t1-hopper`), the tail keeps the top part, and the look leaves the physics world
 * as it was; the cargo hold plaque names the owned step and grades the tail (#585's template).
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

const ASSET_ID = 'vehicle-look-cargo-hold'
/** The bare rig, Systems' three steps (#157 comment 6300543785), then two tail points. */
const LOOKS = [
  { purchases: 22, part: null, fitting: null },
  { purchases: 23, part: 'plank-crate', fitting: 'Fitting: Plank crate' },
  { purchases: 31, part: 'ore-hopper', fitting: 'Fitting: Ore hopper' },
  { purchases: 33, part: 'riveted-bin', fitting: 'Fitting: Riveted bin' },
  { purchases: 34, part: 'riveted-bin', fitting: 'Fitting: Riveted bin · Grade 1' },
  { purchases: 35, part: 'riveted-bin', fitting: 'Fitting: Riveted bin · Grade 2' },
]
/**
 * Tail grades the plaque must fit at 360 px. The hold's units stay safe integers only to about
 * purchase 250 (1.15 a purchase, ticket 553), so the game cannot own grade 9999; the unit spec
 * measures that text's width instead (rigLookPlaque.test.ts).
 */
const TAIL_GRADES = [1, 101, 200]
const TOP_STEP = 33
const FITTING = `[data-testid="${WORKSHOP_TEST_IDS.plaqueFitting('cargo_hold')}"]`
const PLAQUE = '[data-plaque="cargo_hold"]'
const VIEWPORTS = [
  { name: 'desktop', size: { width: 1280, height: 720 } },
  { name: 'phone', size: { width: 360, height: 640 } },
]
/**
 * The rig's tier counts majors over every track (#20): the hold alone keeps the tier-1 rig the
 * steps are bought on; 200 drill power puts every look on the tier-3 rig, whose second tank sits
 * just over the hold (#580's review).
 */
const RIG_SHAPES = [
  { name: 'hold-only', drillPower: 0 },
  { name: 'tier-3', drillPower: 200 },
]
const JPEG_QUALITY = 80
/** The look's atlas uploads after the swap; the shot waits this long for it. */
const ART_SETTLE_MS = 1500

interface HoldParts {
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
  if (plaque === null || fitting === null) throw new Error('the cargo hold plaque is not laid out')
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

function holdParts(page: Page): Promise<HoldParts> {
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

const isHopper = (partId: string): boolean => /^t\d+-hopper$/.test(partId)

async function expectLook(page: Page, part: string | null): Promise<void> {
  const expected = part === null ? [] : [`${ASSET_ID}/${part}`]
  await expect.poll(async () => (await holdParts(page)).lookPartIds).toEqual(expected)
  const hoppers = (await holdParts(page)).partIds.filter(isHopper)
  if (part === null) expect(hoppers.length).toBe(1)
  else expect(hoppers).toEqual([])
}

test.describe('cargo hold look (ticket 581)', () => {
  test('swaps each step onto the hold in place of the hatch, the top part on the tail', async ({
    page,
  }) => {
    const errors = await openGame(page)
    for (const { purchases, part } of LOOKS) {
      await setUpgrade(page, 'cargo_hold', purchases)
      await expectLook(page, part)
    }
    expect(errors).toEqual([])
  })

  test('keeps the same bodies and colliders at the lowest and the highest look', async ({
    page,
  }) => {
    const errors = await openGame(page)
    await setUpgrade(page, 'cargo_hold', 22)
    await expectLook(page, null)
    const lowest = await physicsCounts(page)
    await setUpgrade(page, 'cargo_hold', 35)
    await expectLook(page, 'riveted-bin')
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
        await setUpgrade(page, 'cargo_hold', purchases)
        if (fitting === null) await expect(page.locator(FITTING)).toHaveCount(0)
        else await expect(page.locator(FITTING)).toHaveText(fitting)
      }
      for (const grade of TAIL_GRADES) {
        await setUpgrade(page, 'cargo_hold', TOP_STEP + grade)
        await expect(page.locator(FITTING)).toContainText('· Grade ')
        await page.locator(PLAQUE).scrollIntoViewIfNeeded()
        expect(await fittingOverflowOf(page), `grade ${grade}`).toBeLessThanOrEqual(1)
        await test.info().attach(`cargo hold grade ${grade}, ${viewport.name}`, {
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
          await setUpgrade(page, 'cargo_hold', purchases)
          await expectLook(page, part)
          await page.waitForTimeout(ART_SETTLE_MS)
          await page.screenshot({
            path: test
              .info()
              .outputPath(`cargo-hold-${shape.name}-${purchases}-${viewport.name}.jpg`),
            type: 'jpeg',
            quality: JPEG_QUALITY,
          })
        }
      }
      expect(errors).toEqual([])
    })
  }
})
