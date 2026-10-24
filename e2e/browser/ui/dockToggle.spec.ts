/**
 * The Dock button toggles (ticket 794, Bjor's phone report of 24 Oct; GD Q1 a, Q2 i): once docked
 * the same button, or E on desktop, closes the station interface and drives off in one press,
 * from the bay or from the sheet over it. On a phone the cluster keeps the button in Interact's
 * slot as Undock; on desktop E docks and E undocks, while Space still presses a focused bay
 * button and confirms on the sheet. The docked cluster's geometry at 360 px and the docked
 * footer's E tag at 1280x800 are the goldens. State and geometry through the DOM and
 * `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { UI_IDS } from '../../../src/ui/ids'
import { openGame, SLACK_PX, type HudLayoutCell } from '../hud/hudLayoutHelpers'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 240_000
const INTERACT = 'touch-interact'
const UNDOCK = 'touch-undock'
const BAY_SCREEN = 'platform-screen'
const LEDGER_TAB = 'ledger'

/** iPhone 13 either way up (the ticket's phone cells) and the 360 px phone golden. */
const PHONE_VIEWPORTS = [
  { name: 'iphone-13-portrait', width: 390, height: 844 },
  { name: 'iphone-13-landscape', width: 844, height: 390 },
  { name: 'phone-360x640', width: 360, height: 640 },
]

const DESKTOP: HudLayoutCell = cellOf({ name: 'desktop-1280x800', width: 1280, height: 800 }, false)

function cellOf(viewport: { name: string; width: number; height: number }, isTouch: boolean) {
  const cell: HudLayoutCell = {
    name: viewport.name,
    viewport: { width: viewport.width, height: viewport.height },
    isTouch,
    isTvMode: false,
    floor: null,
  }
  return cell
}

function vehicleMode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const state = result.snapshot.state as {
      players: Record<string, { vehicle: { mode: string } }>
    }
    return Object.values(state.players)[0].vehicle.mode
  })
}

function openSheetTab(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSheet()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.sheet.openTabId
  })
}

async function openLedger(page: Page): Promise<void> {
  await page.evaluate((tabId) => {
    const result = window.steampunkDebug!.ui.openSheet(tabId)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, LEDGER_TAB)
  await expect.poll(() => openSheetTab(page)).toBe(LEDGER_TAB)
}

/** The newest pressed action ids, so a key's meaning in the top layer can be read. */
function pressedActions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.input.getActionStream()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stream.filter((edge) => edge.isDown).map((edge) => edge.actionId)
  })
}

async function expectDriving(page: Page): Promise<void> {
  await expect.poll(() => vehicleMode(page)).not.toBe('docked')
  await expect(page.getByTestId(BAY_SCREEN)).toHaveCount(0)
  expect(await openSheetTab(page)).toBeNull()
}

async function boxOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox()
  if (box === null) throw new Error(`${testId} has no box`)
  return box
}

for (const viewport of PHONE_VIEWPORTS) {
  test.describe(`dock button toggles (ticket 794): ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: true,
      hasTouch: true,
    })

    test('keeps the Dock button in its slot once docked, and a tap on it drives off', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cellOf(viewport, true))
      await expect(page.getByTestId(INTERACT)).toBeVisible()
      const dockBox = await boxOf(page, INTERACT)
      await page.getByTestId(INTERACT).tap()
      await expect(page.getByTestId(BAY_SCREEN)).toBeVisible()
      await expect(page.getByTestId(UNDOCK)).toBeVisible()
      const undockBox = await boxOf(page, UNDOCK)
      expect(Math.abs(undockBox.x - dockBox.x)).toBeLessThanOrEqual(SLACK_PX)
      expect(Math.abs(undockBox.y - dockBox.y)).toBeLessThanOrEqual(SLACK_PX)
      expect(Math.abs(undockBox.width - dockBox.width)).toBeLessThanOrEqual(SLACK_PX)
      await page.getByTestId(UNDOCK).tap()
      await expectDriving(page)
      await expect(page.getByTestId(INTERACT)).toBeVisible()
      expect(errors).toEqual([])
    })

    test('closes the sheet over the bay and drives off in one tap of the Dock button', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cellOf(viewport, true))
      await page.getByTestId(INTERACT).tap()
      await expect(page.getByTestId(BAY_SCREEN)).toBeVisible()
      await openLedger(page)
      await expect(page.getByTestId(UNDOCK)).toBeVisible()
      await page.getByTestId(UNDOCK).tap()
      await expectDriving(page)
      expect(errors).toEqual([])
    })
  })
}

test.describe(`dock key toggles (ticket 794): ${DESKTOP.name}`, () => {
  test.use({ viewport: DESKTOP.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

  test('docks on E and undocks on E again, the footer tagging Undock with E', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page, DESKTOP)
    await page.keyboard.press('KeyK')
    await page.keyboard.press('KeyE')
    await expect(page.getByTestId(BAY_SCREEN)).toBeVisible()
    await expect(
      page.locator(`[data-testid="${BAY_SCREEN}"] footer [data-key-tag="E"]`),
    ).toBeVisible()
    await expect(page.getByTestId(UNDOCK)).toHaveCount(0)
    await page.keyboard.press('KeyE')
    await expectDriving(page)
    expect(errors).toEqual([])
  })

  test('closes the sheet over the bay and undocks on one E, while Space still confirms', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGame(page, DESKTOP)
    await page.keyboard.press('KeyK')
    await page.keyboard.press('KeyE')
    await expect(page.getByTestId(BAY_SCREEN)).toBeVisible()
    await page.getByTestId(UI_IDS.platformSettings).focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('settings-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('settings-panel')).toHaveCount(0)
    await openLedger(page)
    await page.keyboard.press('Space')
    expect((await pressedActions(page)).at(-1)).toBe('ui_confirm')
    await page.keyboard.press('KeyE')
    expect((await pressedActions(page)).at(-1)).toBe('undock')
    await expectDriving(page)
    expect(errors).toEqual([])
  })
})
