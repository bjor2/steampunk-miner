/**
 * The UI screenshot suite's shared steps (ticket 689), used by `uiShots.spec.ts` and the brass
 * screens' crop (`brassScreens.spec.ts`, ticket 885): the plain debug game a shot starts from, and
 * the shot itself, written before any assertion so a failing layout leaves its picture behind.
 */
import { test, type Page } from '@playwright/test'
import { openGame, type HudLayoutCell } from '../hud/hudLayoutHelpers'

const JPEG_QUALITY = 80
/** A sheet's shutter (`motion.durationsMs.sheet` 200 ms) and a needle's ease, settled. */
const SETTLE_MS = 400

/** The debug build with the opening transmission taken down and, on touch, the controls back. */
export async function openPlainGame(page: Page, cell: HudLayoutCell): Promise<string[]> {
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyK')
  if (cell.isTouch) await page.touchscreen.tap(cell.viewport.width / 2, cell.viewport.height / 2)
  return errors
}

/** Written before any assertion, so a failing layout leaves its picture behind. */
export async function shoot(page: Page, cell: HudLayoutCell, shot: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS)
  const path = process.env.UPDATE_UI_SCREENS
    ? `docs/ui/screens/${cell.name}/${shot}.jpg`
    : test.info().outputPath(`${shot}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: JPEG_QUALITY })
  await test.info().attach(shot, { path, contentType: 'image/jpeg' })
}
