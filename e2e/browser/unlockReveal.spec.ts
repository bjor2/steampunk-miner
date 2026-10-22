/**
 * The unlock reveal (ticket 718) in the preview build, read through
 * `steampunkDebug.features['unlock-reveal'].getReveal()`, the sheet read and the plate's test ids,
 * never pixels. Mounting the guns from the Outfitter (a new capability) shows the brass plate and
 * glows the turret on the car, while a track level shows none; a tap skips it. On a phone the full
 * sheet steps aside for the reveal and comes back on the Outfitter; at 360x640 and 1280x800 the
 * plate sits on screen, under the phone's top keep-out, at least a 44 px target.
 */
import { expect, test, type Page } from '@playwright/test'
import { UI_ID_TEMPLATES } from '../../src/ui/ids'
import { SHEET_UI_IDS } from '../../src/ui/sheet/sheetIds'
import { boxOf } from './screens/screenHelpers'
import {
  buyFromCard,
  dockAtOutfitter,
  GUNS_CARD_TEST_ID,
  holdNextReveal,
  readReveal,
  REVEAL_PLATE_TEST_ID,
  revealTurretMount,
} from './unlockRevealBuys'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000
/** Nothing in the top 15% of a phone takes a tap (design-system section 9). */
const TOP_KEEP_OUT = 0.15
const TAP_TARGET_MIN_PX = 44
const OUTFITTER_TAB_ID = 'workshop.outfitter'

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function engineLevelOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const state = result.snapshot.state as {
      players: Record<string, { vehicle: { levels: Record<string, number> } }>
    }
    return Object.values(state.players)[0].vehicle.levels.engine
  })
}

function sheetNow(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSheet()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.sheet
  })
}

test.describe('unlock reveal (ticket 718)', () => {
  test('a track level reveals nothing; the turret’s mount reveals it on the rig', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page)
    await dockAtOutfitter(page)
    await holdNextReveal(page)
    const engineBefore = await engineLevelOf(page)
    await buyFromCard(page, UI_ID_TEMPLATES.workshopUpgradeBuy('engine'))
    await expect.poll(() => engineLevelOf(page), { timeout: 30_000 }).toBeGreaterThan(engineBefore)
    expect((await readReveal(page)).isPlaying).toBe(false)
    await buyFromCard(page, GUNS_CARD_TEST_ID)
    await expect(page.getByTestId(REVEAL_PLATE_TEST_ID)).toBeVisible({ timeout: 30_000 })
    const reveal = await readReveal(page)
    expect(reveal.item).toBe('module:guns')
    expect(reveal.glowSlots).toContain('turret-mount')
    await page.getByTestId(REVEAL_PLATE_TEST_ID).click()
    await expect(page.getByTestId(REVEAL_PLATE_TEST_ID)).toHaveCount(0)
    expect((await readReveal(page)).isPlaying).toBe(false)
    expect(errors).toEqual([])
  })

  test('ends on its own after its ticks when not held', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page)
    await dockAtOutfitter(page)
    await buyFromCard(page, GUNS_CARD_TEST_ID)
    await expect
      .poll(async () => (await readReveal(page)).item, { intervals: [50] })
      .toBe('module:guns')
    await expect(page.getByTestId(REVEAL_PLATE_TEST_ID)).toHaveCount(0, { timeout: 30_000 })
    expect((await readReveal(page)).isPlaying).toBe(false)
    expect(errors).toEqual([])
  })
})

test.describe('unlock reveal on a phone (ticket 718)', () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true })

  test('the full sheet steps aside for the reveal and comes back on the Outfitter', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page)
    await revealTurretMount(page)
    const aside = await sheetNow(page)
    expect(aside.placement).toBe('full')
    expect(aside.isSteppedAside).toBe(true)
    await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveCount(0, { timeout: 10_000 })
    await page.getByTestId(REVEAL_PLATE_TEST_ID).tap()
    await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toBeVisible({ timeout: 10_000 })
    const back = await sheetNow(page)
    expect(back.isSteppedAside).toBe(false)
    expect(back.openTabId).toBe(OUTFITTER_TAB_ID)
    expect(errors).toEqual([])
  })
})

for (const size of [
  { width: 360, height: 640, isPhone: true },
  { width: 1280, height: 800, isPhone: false },
]) {
  test.describe(`unlock reveal plate at ${size.width}x${size.height} (ticket 718)`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.isPhone })

    test('sits on screen as one tap target, under the phone’s top keep-out', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page)
      await revealTurretMount(page)
      const plate = await boxOf(page, REVEAL_PLATE_TEST_ID)
      expect(plate.left).toBeGreaterThanOrEqual(0)
      expect(plate.right).toBeLessThanOrEqual(size.width)
      expect(plate.bottom).toBeLessThanOrEqual(size.height)
      expect(plate.height).toBeGreaterThanOrEqual(TAP_TARGET_MIN_PX)
      if (size.isPhone) expect(plate.top).toBeGreaterThanOrEqual(size.height * TOP_KEEP_OUT)
      expect(errors).toEqual([])
    })
  })
}
