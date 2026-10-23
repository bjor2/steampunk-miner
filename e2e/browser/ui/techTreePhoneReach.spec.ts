/**
 * The Tech tree button takes a finger on a phone held upright, and a click on the desktop. While
 * the vehicle has the input on a touch screen the pinch-and-double-tap surface lies over the whole
 * HUD; the button has to rise over it (as the strip's gear does, ticket 684), or the tap lands on
 * the surface and the Patent Office never opens. A player's launch: the title menu, New Game.
 */
import { expect, test, type Page } from '@playwright/test'
import { TREE_TEST_IDS } from '../../../src/features/tech-tree/ui/nodeTestIds'

async function startNewGame(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 120_000 })
  await expect(page.getByTestId('tech-tree-open').locator('button')).toBeVisible({
    timeout: 60_000,
  })
}

/** Whether the element under the button's centre is the button (nothing lies over it). */
function isButtonOnTop(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const button = document.querySelector('[data-testid="tech-tree-open"] button')
    if (!button) return false
    const box = button.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return top !== null && button.contains(top)
  })
}

for (const viewport of [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
]) {
  test.describe(`phone upright ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true })

    test('a tap on the Tech tree button opens the Patent Office', async ({ page }) => {
      test.setTimeout(240_000)
      await startNewGame(page)
      expect(await isButtonOnTop(page)).toBe(true)
      await page.getByTestId('tech-tree-open').locator('button').tap()
      await expect(page.getByTestId(TREE_TEST_IDS.patentCards)).toBeVisible({ timeout: 30_000 })
    })
  })
}

test.describe('desktop 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('a click on the Tech tree button opens the Patent Office', async ({ page }) => {
    test.setTimeout(240_000)
    await startNewGame(page)
    expect(await isButtonOnTop(page)).toBe(true)
    await page.getByTestId('tech-tree-open').locator('button').click()
    await expect(page.getByTestId(TREE_TEST_IDS.patentCards)).toBeVisible({ timeout: 30_000 })
  })
})
