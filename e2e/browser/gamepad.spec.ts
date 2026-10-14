/**
 * The gamepad device adapter in the preview build (ticket 346): a pad frame goes in through
 * `steampunkDebug.input.padFrame`, the same entry the shell's poll uses, and the action stream, the
 * pause menu, the settings flag and the aim read come back through `steampunkDebug`, never pixels. A held button
 * presses once, the right-stick click is `toggle_auto_fire`, the stick aims without pressing, and a
 * pad rebinding lands in the bindings.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { UI_ID_TEMPLATES, UI_IDS } from '../../src/systems/views/screenIds'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** The standard mapping's indices for the buttons these cases press. */
const BUTTON_INDEX = { PadA: 0, PadX: 2, PadLB: 4, PadStart: 9, PadRS: 11, PadDown: 13 } as const
type Button = keyof typeof BUTTON_INDEX

interface PadFrame {
  buttons: { value: number }[]
  axes: number[]
}

function padFrame(held: readonly Button[], rightStick: readonly [number, number] = [0, 0]) {
  const buttons = Array.from({ length: 17 }, () => ({ value: 0 }))
  for (const button of held) buttons[BUTTON_INDEX[button]] = { value: 1 }
  return { buttons, axes: [0, 0, rightStick[0], rightStick[1]] } satisfies PadFrame
}

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

/** Feeds `count` frames of one pad, as the shell's poll would over that many animation frames. */
function feedFrames(page: Page, frame: PadFrame, count: number): Promise<boolean> {
  return page.evaluate(
    ({ frame, count }) => {
      let isOk = true
      for (let index = 0; index < count; index++) {
        isOk = window.steampunkDebug!.input.padFrame(frame).ok && isOk
      }
      return isOk
    },
    { frame, count },
  )
}

function actionStream(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.input.getActionStream()
    if (!result.ok) throw new Error('getActionStream failed')
    return result.stream.map((edge) => `${edge.actionId}${edge.isDown ? '+' : '-'}`)
  })
}

test('a held right-stick click presses toggle_auto_fire once, and the stick aims without pressing', async ({
  page,
}) => {
  const errors = await openGame(page)
  expect(await feedFrames(page, padFrame(['PadRS']), 120)).toBe(true)
  expect(await feedFrames(page, padFrame([], [0.9, 0.3]), 30)).toBe(true)
  const aim = await page.evaluate(() => window.steampunkDebug!.input.getPadAim())
  expect(aim).toEqual({ ok: true, aim: { x: 0.9, y: 0.3 } })
  expect(await actionStream(page)).toEqual(['toggle_auto_fire+'])
  expect(errors).toEqual([])
})

test('Start opens the pause menu, its Settings opens from the pad, and a pad press while one waits rebinds it', async ({
  page,
}) => {
  const errors = await openGame(page)
  await feedFrames(page, padFrame(['PadStart']), 1)
  await expect(page.getByTestId(UI_IDS.pauseMenu)).toBeVisible()
  // Resume is focused first (ticket 404): down twice to Settings, then A.
  for (const button of ['PadDown', 'PadDown', 'PadA'] as const) {
    await feedFrames(page, padFrame([]), 1)
    await feedFrames(page, padFrame([button]), 1)
  }
  await expect(page.getByTestId(UI_IDS.settingsPanel)).toBeVisible()
  await feedFrames(page, padFrame([]), 1)
  // Every plain vehicle button is bound (RT fires the bore gun, ticket 345), so the free one is a
  // chord: LB is held before the capture starts, as a player holds it before pressing X.
  await feedFrames(page, padFrame(['PadLB']), 1)
  await page.getByTestId(UI_ID_TEMPLATES.settingsRebind('use_slot_5')).click()
  await feedFrames(page, padFrame(['PadLB', 'PadX']), 1)
  const rebound = await page.evaluate(() => window.steampunkDebug!.input.getBindings())
  expect(rebound.ok && rebound.overrides).toEqual({ use_slot_5: { gamepad: ['PadLB+PadX'] } })
  expect(errors).toEqual([])
})

test('a refused pad frame presses nothing and names its problems', async ({ page }) => {
  const errors = await openGame(page)
  const refused = await page.evaluate(() =>
    window.steampunkDebug!.input.padFrame({ buttons: [{ value: 3 }], axes: [] }),
  )
  expect(refused.ok).toBe(false)
  expect(await actionStream(page)).toEqual([])
  expect(errors).toEqual([])
})
