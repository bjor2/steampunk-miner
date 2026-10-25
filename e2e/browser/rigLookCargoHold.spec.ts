/**
 * The cargo hold's rig looks in the browser (ticket 581): from 11 purchases each step of
 * `rigLook.json` swaps its part of `vehicle-look-cargo-hold` onto `hull.cargo` in place of the
 * rig's ore hatch (`t1-hopper`), to the aether hold at 231 (ticket 872), the tail keeps the top part, and the look leaves the physics world
 * as it was; the cargo hold card names the owned band, past the art its finish and the exact
 * level (#585's template, ticket 809). Asserted through `steampunkDebug`, never pixels; the shots
 * at every step and two finish bands, desktop and 360 px, by the rig's tier 1 and tier 3 shape, are written to the test's output
 * folder for review, never compared.
 */
import { expect, test, type Page } from '@playwright/test'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'
import type { DebugApi } from '../../src/debug/debugApi'
import { UI_ID_TEMPLATES } from '../../src/systems/views/screenIds'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const ASSET_ID = 'vehicle-look-cargo-hold'
/**
 * The bare rig, the twenty-one steps on the band edges of 11 to about P40 (ticket 809; the LK4
 * racks and panniers of ticket 812, the sixteen LK9 parts of ticket 872), then two finish bands.
 */
const LOOKS = [
  { purchases: 10, part: null, fitting: null },
  { purchases: 11, part: 'plank-crate', fitting: 'Fitting: Plank crate' },
  { purchases: 22, part: 'ore-hopper', fitting: 'Fitting: Ore hopper' },
  { purchases: 33, part: 'riveted-bin', fitting: 'Fitting: Riveted bin' },
  { purchases: 44, part: 'racked-bin', fitting: 'Fitting: Side racks' },
  { purchases: 55, part: 'pannier-bin', fitting: 'Fitting: Strapped panniers' },
  { purchases: 66, part: 'netted-bin', fitting: 'Fitting: Cargo nets' },
  { purchases: 77, part: 'tarped-bin', fitting: 'Fitting: Oiled tarp' },
  { purchases: 88, part: 'barred-bin', fitting: 'Fitting: Lock bar' },
  { purchases: 99, part: 'bumpered-bin', fitting: 'Fitting: Brass bumper' },
  { purchases: 110, part: 'lamped-bin', fitting: 'Fitting: Cargo lantern' },
  { purchases: 121, part: 'clamped-bin', fitting: 'Fitting: Lid clamps' },
  { purchases: 132, part: 'locked-bin', fitting: 'Fitting: Lock plate' },
  { purchases: 143, part: 'gauged-bin', fitting: 'Fitting: Load gauge' },
  { purchases: 154, part: 'railed-bin', fitting: 'Fitting: Lid handrail' },
  { purchases: 165, part: 'plated-bin', fitting: 'Fitting: Pannier plates' },
  { purchases: 176, part: 'piped-bin', fitting: 'Fitting: Copper lines' },
  { purchases: 187, part: 'hoisted-bin', fitting: 'Fitting: Hoist tackle' },
  { purchases: 198, part: 'sealed-bin', fitting: 'Fitting: Aether seals' },
  { purchases: 209, part: 'field-bin', fitting: 'Fitting: Stasis field' },
  { purchases: 220, part: 'haloed-bin', fitting: 'Fitting: Aether halos' },
  { purchases: 231, part: 'aether-bin', fitting: 'Fitting: Aether hold' },
  { purchases: 242, part: 'aether-bin', fitting: 'Fitting: Burnished iron · L242' },
  { purchases: 253, part: 'aether-bin', fitting: 'Fitting: Bright brass · L253' },
]
/**
 * Levels the card must fit at 360 px past the art. Since ticket 849 the hold's units are bigint,
 * so any level is owned; 361 was the old safe-integer ceiling, where the widest text under 1,000
 * was measured. The unit spec measures the widest text (rigLookPlaque.test.ts).
 */
const TAIL_LEVELS = [242, 253, 361]
const CARD = `[data-testid="${UI_ID_TEMPLATES.workshopUpgradeBuy('cargo_hold')}"]`
const FITTING = `${CARD} [data-sheet-card-line]`
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
  await expect(page.locator(CARD)).toBeAttached({ timeout: 60_000 })
  return errors
}

/** How far the fitting fact runs past its card's right edge, in CSS pixels (0: inside it). */
async function fittingOverflowOf(page: Page): Promise<number> {
  const card = await page.locator(CARD).boundingBox()
  const fitting = await page.locator(FITTING).boundingBox()
  if (card === null || fitting === null) throw new Error('the cargo hold card is not laid out')
  return Math.max(0, fitting.x + fitting.width - (card.x + card.width))
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
  test('swaps each step onto the hold in place of the hatch, the top part past the art', async ({
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
    await setUpgrade(page, 'cargo_hold', 10)
    await expectLook(page, null)
    const lowest = await physicsCounts(page)
    await setUpgrade(page, 'cargo_hold', 253)
    await expectLook(page, 'aether-bin')
    await expect.poll(() => physicsCounts(page)).toEqual(lowest)
    expect(errors).toEqual([])
  })

  for (const viewport of VIEWPORTS) {
    test(`names the owned band on the card, the level past the art, ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport.size)
      const errors = await openAtTheWorkshop(page)
      for (const { purchases, fitting } of LOOKS) {
        await setUpgrade(page, 'cargo_hold', purchases)
        if (fitting === null) await expect(page.locator(FITTING)).not.toContainText('Fitting:')
        else await expect(page.locator(FITTING)).toContainText(fitting)
      }
      for (const level of TAIL_LEVELS) {
        await setUpgrade(page, 'cargo_hold', level)
        await expect(page.locator(FITTING)).toContainText(` · L${level}`)
        await page.locator(CARD).scrollIntoViewIfNeeded()
        expect(await fittingOverflowOf(page), `level ${level}`).toBeLessThanOrEqual(1)
        await test.info().attach(`cargo hold level ${level}, ${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
      expect(errors).toEqual([])
    })

    test(`shoots every step and two finish bands at ${viewport.name} size`, async ({ page }) => {
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
