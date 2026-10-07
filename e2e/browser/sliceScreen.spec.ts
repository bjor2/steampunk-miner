/**
 * A slice's full screen (ticket 211): the example slice's screen opens through
 * `steampunkDebug.ui.openScreen` and closes on Escape, the existing back action, on the preview
 * build. Asserted through the debug API and the frame's test id, never pixels. That opening one
 * changes no digest is a vitest spec (src/ui/screens/sliceScreen.test.ts): the live game ticks.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { UI_IDS } from '../../src/systems/views/screenIds'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const EXAMPLE_SCREEN_ID = 'example.screen'

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function openScreenId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getOpenScreen()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.screenId
  })
}

test.describe('slice screen (ticket 211)', () => {
  test('opens a registered slice screen and dismisses it on Escape', async ({ page }) => {
    const errors = await openGame(page)
    const opened = await page.evaluate(
      (id) => window.steampunkDebug!.ui.openScreen(id),
      EXAMPLE_SCREEN_ID,
    )
    expect(opened).toEqual({ ok: true })
    expect(await openScreenId(page)).toBe(EXAMPLE_SCREEN_ID)
    const frame = page.getByTestId(UI_IDS.sliceScreen)
    await expect(frame).toHaveAttribute('data-screen-id', EXAMPLE_SCREEN_ID)

    await page.keyboard.press('Escape')
    await expect.poll(() => openScreenId(page)).toBeNull()
    await expect(frame).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('refuses a screen id no slice registered', async ({ page }) => {
    await openGame(page)
    const refused = await page.evaluate(() => window.steampunkDebug!.ui.openScreen('nobody.screen'))
    expect(refused).toEqual({
      ok: false,
      problems: ['no slice registered the screen "nobody.screen"'],
    })
    expect(await openScreenId(page)).toBeNull()
  })
})
