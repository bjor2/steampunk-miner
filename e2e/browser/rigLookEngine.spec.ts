/**
 * The engine's rig looks in the browser (ticket 587): from 2 purchases each step of `rigLook.json`
 * lays its part of `vehicle-look-engine` on `chassis.drive`, the middle roller's hub, over the
 * chassis and hiding no rig part; the tail keeps the top part, and the look leaves the physics world
 * as it was; the engine plaque names the owned step and grades the tail (#585's template). Asserted
 * through `steampunkDebug`, never pixels; the shots at every step and two tail points, desktop and
 * 360 px, by the rig's tier 1 and tier 3 shape, are written to the test's output folder for review,
 * never compared.
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

const ASSET_ID = 'vehicle-look-engine'
/** The bare rig, Systems' three steps (#157 comment 6300543785), then two tail points. */
const LOOKS = [
  { purchases: 1, part: null, fitting: null },
  { purchases: 2, part: 'single-piston', fitting: 'Fitting: Single piston' },
  { purchases: 18, part: 'triple-flywheel', fitting: 'Fitting: Triple flywheel' },
  { purchases: 26, part: 'guild-turbine', fitting: 'Fitting: Guild turbine' },
  { purchases: 27, part: 'guild-turbine', fitting: 'Fitting: Guild turbine · Grade 1' },
  { purchases: 28, part: 'guild-turbine', fitting: 'Fitting: Guild turbine · Grade 2' },
]
/**
 * Tail grades the plaque must fit at 360 px, kept to the range the cargo hold's spec owns (ticket
 * 581); the unit spec measures the grade 9999 and 1M texts' width (rigLookPlaque.test.ts).
 */
const TAIL_GRADES = [1, 101, 200]
const TOP_STEP = 26
const FITTING = `[data-testid="${WORKSHOP_TEST_IDS.plaqueFitting('engine')}"]`
const PLAQUE = '[data-plaque="engine"]'
const VIEWPORTS = [
  { name: 'desktop', size: { width: 1280, height: 720 } },
  { name: 'phone', size: { width: 360, height: 640 } },
]
/**
 * The rig's tier counts majors over every track (#20): the engine alone keeps the tier-1 rig the
 * steps are bought on; 200 drill power puts every look on the tier-3 rig, whose roller is wider
 * (#586's review).
 */
const RIG_SHAPES = [
  { name: 'engine-only', drillPower: 0 },
  { name: 'tier-3', drillPower: 200 },
]
const JPEG_QUALITY = 80
/** The look's atlas uploads after the swap; the shot waits this long for it. */
const ART_SETTLE_MS = 1500

interface EngineParts {
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
  if (plaque === null || fitting === null) throw new Error('the engine plaque is not laid out')
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

function engineParts(page: Page): Promise<EngineParts> {
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

/** The look lies over the hub: the rig's own parts are the bare rig's at every step. */
async function expectLook(page: Page, part: string | null, bare: string[]): Promise<void> {
  const expected = part === null ? [] : [`${ASSET_ID}/${part}`]
  await expect.poll(async () => (await engineParts(page)).lookPartIds).toEqual(expected)
  expect((await engineParts(page)).partIds).toEqual(bare)
}

async function bareRigParts(page: Page): Promise<string[]> {
  await setUpgrade(page, 'engine', 0)
  await expect.poll(async () => (await engineParts(page)).lookPartIds).toEqual([])
  return (await engineParts(page)).partIds
}

test.describe('engine look (ticket 587)', () => {
  test('lays each step on the roller hub, hiding no rig part, the top part on the tail', async ({
    page,
  }) => {
    const errors = await openGame(page)
    const bare = await bareRigParts(page)
    for (const { purchases, part } of LOOKS) {
      await setUpgrade(page, 'engine', purchases)
      await expectLook(page, part, bare)
    }
    expect(errors).toEqual([])
  })

  test('keeps the same bodies and colliders at the lowest and the highest look', async ({
    page,
  }) => {
    const errors = await openGame(page)
    const bare = await bareRigParts(page)
    await setUpgrade(page, 'engine', 1)
    await expectLook(page, null, bare)
    const lowest = await physicsCounts(page)
    await setUpgrade(page, 'engine', 28)
    await expectLook(page, 'guild-turbine', bare)
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
        await setUpgrade(page, 'engine', purchases)
        if (fitting === null) await expect(page.locator(FITTING)).toHaveCount(0)
        else await expect(page.locator(FITTING)).toHaveText(fitting)
      }
      for (const grade of TAIL_GRADES) {
        await setUpgrade(page, 'engine', TOP_STEP + grade)
        await expect(page.locator(FITTING)).toContainText('· Grade ')
        await page.locator(PLAQUE).scrollIntoViewIfNeeded()
        expect(await fittingOverflowOf(page), `grade ${grade}`).toBeLessThanOrEqual(1)
        await test.info().attach(`engine grade ${grade}, ${viewport.name}`, {
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
        const bare = await bareRigParts(page)
        for (const { purchases, part } of LOOKS) {
          await setUpgrade(page, 'engine', purchases)
          await expectLook(page, part, bare)
          await page.waitForTimeout(ART_SETTLE_MS)
          await page.screenshot({
            path: test.info().outputPath(`engine-${shape.name}-${purchases}-${viewport.name}.jpg`),
            type: 'jpeg',
            quality: JPEG_QUALITY,
          })
        }
      }
      expect(errors).toEqual([])
    })
  }
})
