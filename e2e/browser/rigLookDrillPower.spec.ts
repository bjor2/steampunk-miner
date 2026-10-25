/**
 * The drill power line's rig looks in the browser (ticket 875, LK12): from 60 purchases each step
 * of `rigLook.json` lays its housing part of `vehicle-look-drill-power` on `drill.housing`, the
 * GD's drill_power point on the pod's bow, body-fixed over the housing drum, hiding no rig part and
 * adding no head sprite; #554's nine glow rows below it keep the bare housing; the tail keeps the
 * top part; the look leaves the physics world as it was; the drill power card names the owned band
 * from the first glow row, past the art its finish and the exact level (#585's template, ticket
 * 809). Asserted through `steampunkDebug`, never pixels; the shots at every step and two finish
 * bands, at 1280 and 360 px, are written to the test's output folder for review, never compared.
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

const ASSET_ID = 'vehicle-look-drill-power'
/** The bare rig, two of #554's glow rows, the twelve part steps on the edges of 6 to 126, then two finish bands. */
const LOOKS = [
  { purchases: 5, part: null, fitting: null },
  { purchases: 6, part: null, fitting: 'Fitting: Amber glow' },
  { purchases: 54, part: null, fitting: 'Fitting: Sun glow' },
  { purchases: 60, part: 'gauged-housing', fitting: 'Fitting: Pressure gauge' },
  { purchases: 66, part: 'valved-housing', fitting: 'Fitting: Relief valve' },
  { purchases: 72, part: 'piped-housing', fitting: 'Fitting: Steam feed' },
  { purchases: 78, part: 'finned-housing', fitting: 'Fitting: Cooling fins' },
  { purchases: 84, part: 'clamped-housing', fitting: 'Fitting: Clamp band' },
  { purchases: 90, part: 'flywheel-housing', fitting: 'Fitting: Power flywheel' },
  { purchases: 96, part: 'bolted-housing', fitting: 'Fitting: Hex bolts' },
  { purchases: 102, part: 'ribbed-housing', fitting: 'Fitting: Iron ribs' },
  { purchases: 108, part: 'coiled-housing', fitting: 'Fitting: Copper coils' },
  { purchases: 114, part: 'lensed-housing', fitting: 'Fitting: Sight lenses' },
  { purchases: 120, part: 'haloed-housing', fitting: 'Fitting: Flywheel halo' },
  { purchases: 126, part: 'aether-housing', fitting: 'Fitting: Aether housing' },
  { purchases: 132, part: 'aether-housing', fitting: 'Fitting: Gilt · L132' },
  { purchases: 138, part: 'aether-housing', fitting: 'Fitting: Blued steel · L138' },
]
/** The top authored part, which every finish band past the art keeps. */
const TOP_PART = 'aether-housing'
/** Levels the card must fit at 360 px past the art; the unit spec measures the widest text. */
const TAIL_LEVELS = [132, 1_000, 1_000_000]
const CARD = `[data-testid="${UI_ID_TEMPLATES.workshopUpgradeBuy('drill_power')}"]`
const FITTING = `${CARD} [data-sheet-card-line]`
const VIEWPORTS = [
  { name: 'desktop', size: { width: 1280, height: 720 } },
  { name: 'phone', size: { width: 360, height: 640 } },
]
/** The drill power line alone puts the rig on tier 3 past about 200 purchases (#20), where the bow armour covers the drum's right side. */
const JPEG_QUALITY = 80
/** The look's atlas uploads after the swap; the shot waits this long for it. */
const ART_SETTLE_MS = 1500

interface RigParts {
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
  if (card === null || fitting === null) throw new Error('the drill power card is not laid out')
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

function rigParts(page: Page): Promise<RigParts> {
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

/** The look lies over the housing: the rig's own parts, head and bit included, stay at every step. */
async function expectLook(page: Page, part: string | null, bare: string[]): Promise<void> {
  const expected = part === null ? [] : [`${ASSET_ID}/${part}`]
  await expect.poll(async () => (await rigParts(page)).lookPartIds).toEqual(expected)
  expect((await rigParts(page)).partIds).toEqual(bare)
}

/** The rig's own parts at the tier the count puts it on, read with the look off the track. */
async function bareRigPartsAt(page: Page, purchases: number): Promise<string[]> {
  await setUpgrade(page, 'drill_power', purchases)
  await expect.poll(async () => (await rigParts(page)).lookPartIds).toEqual([])
  return (await rigParts(page)).partIds
}

test.describe('drill power look (ticket 875)', () => {
  test('lays each step on the drill housing, hiding no rig part, the top part past the art', async ({
    page,
  }) => {
    const errors = await openGame(page)
    for (const { purchases, part } of LOOKS) {
      const bare = await bareRigPartsAt(page, 5)
      await setUpgrade(page, 'drill_power', purchases)
      await expectLook(page, part, bare)
    }
    expect(errors).toEqual([])
  })

  test('keeps the same bodies and colliders at the lowest and the highest look', async ({
    page,
  }) => {
    const errors = await openGame(page)
    const bare = await bareRigPartsAt(page, 5)
    await expectLook(page, null, bare)
    const lowest = await physicsCounts(page)
    await setUpgrade(page, 'drill_power', 138)
    await expect
      .poll(async () => (await rigParts(page)).lookPartIds)
      .toEqual([`${ASSET_ID}/${TOP_PART}`])
    await expect.poll(() => physicsCounts(page)).toEqual(lowest)
    expect(errors).toEqual([])
  })

  test('layers with the drill tip crowns: both looks show, the head keeps one sprite', async ({
    page,
  }) => {
    const errors = await openGame(page)
    await setUpgrade(page, 'drill_tip', 300)
    await setUpgrade(page, 'drill_power', 90)
    await expect
      .poll(async () => (await rigParts(page)).lookPartIds.sort())
      .toEqual([`${ASSET_ID}/flywheel-housing`, 'vehicle-look-drill-tip/aether-cut-crown'])
    const heads = (await rigParts(page)).partIds.filter((id) => id.endsWith('-drill-head'))
    expect(heads).toHaveLength(1)
    expect(errors).toEqual([])
  })

  for (const viewport of VIEWPORTS) {
    test(`names the owned band on the card, the level past the art, ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport.size)
      const errors = await openAtTheWorkshop(page)
      for (const { purchases, fitting } of LOOKS) {
        await setUpgrade(page, 'drill_power', purchases)
        if (fitting === null) await expect(page.locator(FITTING)).not.toContainText('Fitting:')
        else await expect(page.locator(FITTING)).toContainText(fitting)
      }
      for (const level of TAIL_LEVELS) {
        await setUpgrade(page, 'drill_power', level)
        await expect(page.locator(FITTING)).toContainText(' · L')
        await page.locator(CARD).scrollIntoViewIfNeeded()
        expect(await fittingOverflowOf(page), `level ${level}`).toBeLessThanOrEqual(1)
        await test.info().attach(`drill power level ${level}, ${viewport.name}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
      expect(errors).toEqual([])
    })

    test(`shoots every step and two finish bands at ${viewport.name} size`, async ({ page }) => {
      await page.setViewportSize(viewport.size)
      const errors = await openGame(page)
      for (const { purchases, part } of LOOKS) {
        const bare = await bareRigPartsAt(page, 5)
        await setUpgrade(page, 'drill_power', purchases)
        await expectLook(page, part, bare)
        await page.waitForTimeout(ART_SETTLE_MS)
        await page.screenshot({
          path: test.info().outputPath(`drill-power-${purchases}-${viewport.name}.jpg`),
          type: 'jpeg',
          quality: JPEG_QUALITY,
        })
      }
      expect(errors).toEqual([])
    })
  }
})
