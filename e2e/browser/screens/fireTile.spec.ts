/**
 * The bore gun's fire tile on the touch controls (ticket 314, #309 touch input): no tile until the
 * gun is mounted, then a 56 px tile beside the power-up column that fires on a tap, through the
 * client's own input path, and its brass ring reads the recovery. State through `steampunkDebug`,
 * the run log and the DOM's test ids, never pixels; the tile after a shot is attached for the eye.
 */
import { expect, test, type Page } from '@playwright/test'
import { currentCell, openGame } from './screenHelpers'

declare global {
  interface Window {
    steampunkRunLog?: () => string
  }
}

const FIRE_TILE = 'ground-gun-fire-tile'
/** #173's touch target: 56 px on a coarse pointer. */
const TOUCH_TARGET_PX = 56

interface GunRead {
  levels: { rate: number; penetration: number; energy: number }
  tile: { recoveryFilledPercent: number; isRecovering: boolean } | null
  tick: number
  nextShotTick: number
}

test.beforeEach(() => {
  const cell = currentCell()
  test.skip(!cell.isTouch || cell.isPortrait, 'the fire tile shows in landscape on touch screens')
})

function readGun(page: Page): Promise<GunRead> {
  return page.evaluate(
    () => window.steampunkDebug!.features['ground-gun'].getGun() as unknown as GunRead,
  )
}

function mountGun(page: Page): Promise<void> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['ground-gun'].setLevels(1, 1, 1)
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
}

function boreShotsLogged(page: Page): Promise<number> {
  return page.evaluate(
    () => (window.steampunkRunLog?.() ?? '').split('"event":"bore_fired"').length - 1,
  )
}

test.describe('screen matrix: the bore gun fire tile (ticket 314)', () => {
  test('shows no tile before the gun is mounted, and a touch-sized one after', async ({ page }) => {
    const errors = await openGame(page, currentCell())
    await expect(page.getByTestId(FIRE_TILE)).toHaveCount(0)
    await mountGun(page)
    const tile = page.getByTestId(FIRE_TILE)
    await expect(tile).toBeVisible()
    const box = await tile.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(TOUCH_TARGET_PX)
    expect(box?.height).toBeGreaterThanOrEqual(TOUCH_TARGET_PX)
    expect(errors).toEqual([])
  })

  test('fires one shot on a tap, and its ring reads ready again once the recovery ends', async ({
    page,
  }, testInfo) => {
    const errors = await openGame(page, currentCell())
    await mountGun(page)
    await page.getByTestId(FIRE_TILE).tap()
    await expect.poll(() => boreShotsLogged(page)).toBe(1)
    const gun = await readGun(page)
    expect(gun.nextShotTick).toBeGreaterThan(0)
    await expect.poll(async () => (await readGun(page)).tile?.isRecovering).toBe(false)
    await testInfo.attach('fire-tile-after-a-shot', {
      body: await page.getByTestId(FIRE_TILE).screenshot(),
      contentType: 'image/png',
    })
    expect(errors).toEqual([])
  })
})
