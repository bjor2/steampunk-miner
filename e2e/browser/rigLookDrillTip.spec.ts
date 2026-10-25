/**
 * The drill tip's rig looks in the browser (tickets 579 and 815): from 60 purchases each step of
 * `rigLook.json` swaps its part of `vehicle-look-drill-tip` onto the drill head in place of the
 * rig's bit, to the twentieth at 1200 (about P40), the tail keeps the top part, and the look leaves the physics world as it was; the
 * drill tip card names the owned band, past the art its finish and the exact level (#585's
 * template, ticket 809). Asserted through `steampunkDebug`, never pixels; the shots at every step
 * and two finish bands,
 * desktop and 360 px, by the rig's tier 1 and tier 3 shape, are written to the test's output
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

const ASSET_ID = 'vehicle-look-drill-tip'
/**
 * The bare rig, the twenty steps on the band edges of 60 to about P40 (tickets 809 and 815:
 * #578's five parts, then each LK6 part fitted onto the aether-cut crown), then two finish bands.
 */
const LOOKS = [
  { purchases: 59, part: null, fitting: null },
  { purchases: 60, part: 'steel-cone', fitting: 'Fitting: Steel cone' },
  { purchases: 120, part: 'fluted-bit', fitting: 'Fitting: Fluted bit' },
  { purchases: 180, part: 'toothed-crown', fitting: 'Fitting: Toothed crown' },
  { purchases: 240, part: 'gem-set-crown', fitting: 'Fitting: Gem-set crown' },
  { purchases: 300, part: 'aether-cut-crown', fitting: 'Fitting: Aether-cut crown' },
  { purchases: 360, part: 'collared-crown', fitting: 'Fitting: Carbide collar' },
  { purchases: 420, part: 'ferruled-crown', fitting: 'Fitting: Steel ferrule' },
  { purchases: 480, part: 'knurled-crown', fitting: 'Fitting: Knurled bands' },
  { purchases: 540, part: 'reamed-crown', fitting: 'Fitting: Reamer ring' },
  { purchases: 600, part: 'chromed-crown', fitting: 'Fitting: Chrome face' },
  { purchases: 660, part: 'bossed-crown', fitting: 'Fitting: Brass bosses' },
  { purchases: 720, part: 'cooled-crown', fitting: 'Fitting: Coolant lines' },
  { purchases: 780, part: 'inlaid-crown', fitting: 'Fitting: Diamond inlays' },
  { purchases: 840, part: 'haloed-crown', fitting: 'Fitting: Spin halo' },
  { purchases: 900, part: 'blur-collar-crown', fitting: 'Fitting: Blur collars' },
  { purchases: 960, part: 'streaked-crown', fitting: 'Fitting: Spin streaks' },
  { purchases: 1020, part: 'double-halo-crown', fitting: 'Fitting: Double halo' },
  { purchases: 1080, part: 'fanned-crown', fitting: 'Fitting: Blur fan' },
  { purchases: 1140, part: 'vortex-crown', fitting: 'Fitting: Vortex core' },
  { purchases: 1200, part: 'aether-vortex-crown', fitting: 'Fitting: Aether vortex' },
  { purchases: 1260, part: 'aether-vortex-crown', fitting: 'Fitting: Nickel plate · L1,260' },
  { purchases: 1320, part: 'aether-vortex-crown', fitting: 'Fitting: Case-hardened · L1,320' },
]
/** The levels the card must fit at 360 px past the art (#809's goldens, the #681 long mode). */
const TAIL_LEVELS = [1_260, 9_999, 1_000_000]
const CARD = `[data-testid="${UI_ID_TEMPLATES.workshopUpgradeBuy('drill_tip')}"]`
const FITTING = `${CARD} [data-sheet-card-line]`
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
  await expect(page.locator(CARD)).toBeAttached({ timeout: 60_000 })
  return errors
}

/** How far the fitting fact runs past its card's right edge, in CSS pixels (0: inside it). */
async function fittingOverflowOf(page: Page): Promise<number> {
  const card = await page.locator(CARD).boundingBox()
  const fitting = await page.locator(FITTING).boundingBox()
  if (card === null || fitting === null) throw new Error('the drill tip card is not laid out')
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

test.describe('drill tip look (tickets 579 and 815)', () => {
  test('swaps each step onto the head in place of the bit, the top part past the art', async ({
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
    await setUpgrade(page, 'drill_tip', 59)
    await expectLook(page, null)
    const lowest = await physicsCounts(page)
    await setUpgrade(page, 'drill_tip', 1320)
    await expectLook(page, 'aether-vortex-crown')
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
        await setUpgrade(page, 'drill_tip', purchases)
        if (fitting === null) await expect(page.locator(FITTING)).not.toContainText('Fitting:')
        else await expect(page.locator(FITTING)).toContainText(fitting)
      }
      for (const level of TAIL_LEVELS) {
        await setUpgrade(page, 'drill_tip', level)
        await expect(page.locator(FITTING)).toContainText(` · L${level.toLocaleString('en-US')}`)
        await page.locator(CARD).scrollIntoViewIfNeeded()
        expect(await fittingOverflowOf(page), `level ${level}`).toBeLessThanOrEqual(1)
        await test.info().attach(`drill tip level ${level}, ${viewport.name}`, {
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
