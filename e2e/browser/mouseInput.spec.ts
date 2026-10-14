/**
 * The mouse as an input device in the preview build (ticket 345, the #314 TD lock section 2): a
 * button pressed on the game canvas presses what `MouseLeft` is bound to (`fire_ground_gun` by
 * default) and comes up wherever it is let go; a click on HUD DOM never reaches the game. Read
 * through `steampunkDebug`'s action stream, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import type { ActionEdge } from '../../src/store/inputRuntime'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

test.describe('mouse buttons as key codes (ticket 345)', () => {
  test('presses fire on a canvas click and nothing on a press over page DOM', async ({ page }) => {
    const errors = await openDrawnGame(page)
    const beforeDom = (await actionStream(page)).length
    await pressMouseOnBody(page)
    expect((await actionStream(page)).slice(beforeDom)).toEqual([])

    const canvas = await page.locator('canvas').first().boundingBox()
    if (canvas === null) throw new Error('the game canvas is not drawn')
    const beforeCanvas = (await actionStream(page)).length
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.75)
    expect((await actionStream(page)).slice(beforeCanvas)).toEqual([
      { actionId: 'fire_ground_gun', isDown: true },
    ])
    expect(errors).toEqual([])
  })
})

/** A left press and release whose target is the page body, as a click on HUD DOM has. */
async function pressMouseOnBody(page: Page): Promise<void> {
  await page.evaluate(() => {
    const press = (type: string, buttons: number) =>
      document.body.dispatchEvent(
        new PointerEvent(type, { pointerType: 'mouse', buttons, bubbles: true }),
      )
    press('pointerdown', 1)
    press('pointerup', 0)
  })
}

async function openDrawnGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => {
    const stats = window.steampunkDebug?.ui.getRenderStats()
    return stats?.ok === true && stats.stats.drawCalls > 0
  })
  return errors
}

function actionStream(page: Page): Promise<ActionEdge[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.input.getActionStream()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stream
  })
}
