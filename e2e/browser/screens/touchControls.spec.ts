/**
 * The touch controls in the touch cells (#173: the TD amendment and Gameplay & Vehicle's five
 * acceptance points): sizes and clearances, the stick and the keys pressing the same action
 * stream, the cluster following the situation, the left-handed mirror, and the keyboard hiding
 * them until the next touch. Every screen is reached by taps alone. Driven by real touch events.
 * Ticket 472 (#470 P1-1): the pause button while diving, the hold while the page is hidden, and
 * the controls inside a notched safe area. Ticket 473 (#470 P1-2): the charge size badge.
 */
import { expect, test, type Page } from '@playwright/test'
import type { ActionEdge } from '../../../src/store/inputRuntime'
import { boxOf, currentCell, hudPanelBoxes, openGame, overlaps, type Box } from './screenHelpers'

const INTERACT_PX = 72
const CLUSTER_PX = 56
/** At least this much between two hit boxes (G&V layout). */
const CLUSTER_GAP_PX = 8
/** Software GL draws a frame in a few hundred ms, so a held step gets several frames to slip. */
const HELD_STEP_WAIT_MS = 1_000
/** A landscape phone's notch on the stick's side (the TD's 844x390 case on #470). */
const LEFT_NOTCH_PX = 47
/** The smallest touch target (#470), the charge size badge's (ticket 473). */
const TOUCH_TARGET_PX = 48

test.beforeEach(() => {
  const cell = currentCell()
  test.skip(!cell.isTouch || cell.isPortrait, 'touch controls play in landscape on touch screens')
})

test.describe('screen matrix: touch controls (#173)', () => {
  test('shows only the stick and Interact on a fresh planet 1 rig, each clear of the HUD', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    await expect(page.getByTestId('touch-controls')).toBeVisible()
    await expect(page.getByTestId('touch-stick-zone')).toBeVisible()
    expect(await clusterIds(page)).toEqual(['touch-interact'])
    const interact = await boxOf(page, 'touch-interact')
    expect(interact.width).toBeGreaterThanOrEqual(INTERACT_PX)
    expect(interact.height).toBeGreaterThanOrEqual(INTERACT_PX)
    const safeArea = await boxOf(page, 'safe-area')
    expect(isInside(interact, safeArea)).toBe(true)
    for (const panel of await hudPanelBoxes(page)) expect(overlaps(interact, panel)).toBe(false)
    const zone = await boxOf(page, 'touch-stick-zone')
    expect(interact.left - zone.right).toBeGreaterThanOrEqual(CLUSTER_GAP_PX)
    expect(errors).toEqual([])
  })

  test('reaches the shop, settings and back by taps alone, Quick service following the dock', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    await page.getByTestId('touch-interact').tap()
    await expect.poll(() => clusterIds(page)).toEqual(['touch-quick_service'])
    await expect(page.getByTestId('platform-screen')).toBeVisible()
    const quick = await boxOf(page, 'touch-quick_service')
    expect(Math.min(quick.width, quick.height)).toBeGreaterThanOrEqual(CLUSTER_PX)
    await page.getByTestId('platform-settings').tap()
    await expect(page.getByTestId('settings-panel')).toBeVisible()
    await page.getByTestId('settings-close').tap()
    await expect(page.getByTestId('settings-panel')).toHaveCount(0)
    await page.getByTestId('platform-undock').tap()
    await expect.poll(() => clusterIds(page)).toEqual(['touch-interact'])
    expect(errors).toEqual([])
  })

  test('presses the same action stream with the stick as with the keys', async ({ page }) => {
    const errors = await openGame(page, currentCell())
    const zone = await boxOf(page, 'touch-stick-zone')
    const start = { x: zone.left + zone.width / 2, y: zone.top + zone.height / 2 }
    const touch = await page.context().newCDPSession(page)
    const touchAt = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      touch.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      })
    const before = (await actionStream(page)).length
    await touchAt('touchStart', start.x, start.y)
    await touchAt('touchMove', start.x + 40, start.y)
    await touchAt('touchMove', start.x + 30, start.y - 30)
    await touchAt('touchMove', start.x + 40, start.y)
    await touchAt('touchEnd', 0, 0)
    const middle = (await actionStream(page)).length
    for (const [code, isDown] of [
      ['KeyD', true],
      ['KeyW', true],
      ['KeyW', false],
      ['KeyD', false],
    ] as const) {
      if (isDown) await page.keyboard.down(code)
      else await page.keyboard.up(code)
    }
    const stream = await actionStream(page)
    const onTouch = stream.slice(before, middle)
    expect(onTouch).toEqual([
      { actionId: 'aim_right', isDown: true },
      { actionId: 'lift', isDown: true },
      { actionId: 'lift', isDown: false },
      { actionId: 'aim_right', isDown: false },
    ])
    expect(stream.slice(middle)).toEqual(onTouch)
    expect(errors).toEqual([])
  })

  test('hides on a key and shows again on the next touch, without a reload', async ({ page }) => {
    const errors = await openGame(page, currentCell())
    await expect(page.getByTestId('touch-controls')).toBeVisible()
    await page.keyboard.press('KeyX')
    await expect(page.getByTestId('touch-controls')).toHaveCount(0)
    await page.touchscreen.tap(currentCell().viewport.width / 2, 40)
    await expect(page.getByTestId('touch-controls')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('mirrors the stick to the right 40% and the cluster to the bottom left when left-handed', async ({
    page,
  }) => {
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await page.evaluate(() => window.steampunkDebug!.ui.setPref('leftHanded', true))
    const zone = await boxOf(page, 'touch-stick-zone')
    const cluster = await boxOf(page, 'touch-cluster')
    expect(zone.left).toBeGreaterThanOrEqual(cell.viewport.width * 0.6 - 1)
    expect(zone.right).toBeCloseTo(cell.viewport.width, 0)
    expect(cluster.right).toBeLessThan(cell.viewport.width / 2)
    expect(cluster.bottom).toBeGreaterThan(cell.viewport.height / 2)
    expect(zone.left - cluster.right).toBeGreaterThanOrEqual(CLUSTER_GAP_PX)
    expect(errors).toEqual([])
  })
})

test.describe('screen matrix: touch pause (ticket 472)', () => {
  test('shows a pause button on the top edge, inside the safe area and clear of the HUD', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    const pause = await boxOf(page, 'touch-open_pause_menu')
    expect(isInside(pause, await boxOf(page, 'safe-area'))).toBe(true)
    expect(pause.top).toBeLessThan(currentCell().viewport.height / 4)
    for (const panel of await hudPanelBoxes(page)) expect(overlaps(pause, panel)).toBe(false)
    expect(overlaps(pause, await boxOf(page, 'touch-cluster'))).toBe(false)
    expect(errors).toEqual([])
  })

  test('holds the step while the pause menu is open and resumes on closing it, as Escape does', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    const before = (await actionStream(page)).length
    await page.getByTestId('touch-open_pause_menu').tap()
    await expect(page.getByTestId('pause-menu')).toBeVisible()
    const held = await tickNow(page)
    await page.waitForTimeout(HELD_STEP_WAIT_MS)
    expect(await tickNow(page)).toBe(held)
    await page.getByTestId('pause-resume').tap()
    await expect(page.getByTestId('pause-menu')).toHaveCount(0)
    await expect.poll(() => tickNow(page)).toBeGreaterThan(held)
    const middle = (await actionStream(page)).length
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('pause-menu')).toBeVisible()
    const stream = await actionStream(page)
    expect(stream.slice(before, middle)).toEqual([{ actionId: 'open_pause_menu', isDown: true }])
    expect(stream.slice(middle)).toEqual(stream.slice(before, middle))
    expect(errors).toEqual([])
  })

  test('holds the step while the page is hidden and resumes on the next tap', async ({ page }) => {
    const errors = await openGame(page, currentCell())
    await expect.poll(() => tickNow(page)).toBeGreaterThan(0)
    await hidePageAndComeBack(page)
    const held = await tickNow(page)
    await page.waitForTimeout(HELD_STEP_WAIT_MS)
    expect(await tickNow(page)).toBe(held)
    await page.touchscreen.tap(currentCell().viewport.width / 2, 40)
    await expect.poll(() => tickNow(page)).toBeGreaterThan(held)
    expect(errors).toEqual([])
  })

  test('keeps the stick zone and Interact inside a left notch', async ({ page }) => {
    const errors = await openGame(page, currentCell())
    // Chromium has no notch to emulate, so the safe area is moved as env(safe-area-inset-left) would.
    await page.addStyleTag({
      content: `[data-testid="safe-area"] { left: ${LEFT_NOTCH_PX}px !important; }`,
    })
    const safeArea = await boxOf(page, 'safe-area')
    expect(safeArea.left).toBeCloseTo(LEFT_NOTCH_PX, 0)
    expect(isInside(await boxOf(page, 'touch-stick-zone'), safeArea)).toBe(true)
    expect(isInside(await boxOf(page, 'touch-interact'), safeArea)).toBe(true)
    expect(isInside(await boxOf(page, 'touch-open_pause_menu'), safeArea)).toBe(true)
    expect(errors).toEqual([])
  })
})

test.describe('screen matrix: charge size badge (ticket 473)', () => {
  test('steps the charge size on a tap of the badge with the same action stream as V', async ({
    page,
  }) => {
    const errors = await openGame(page, currentCell())
    await stockOneChargeSize(page)
    await page.getByTestId('touch-plant_charge').waitFor()
    await expect(page.getByTestId('touch-next_charge_size')).toHaveCount(0)
    await stockSecondChargeSize(page)
    const badge = page.getByTestId('touch-next_charge_size')
    await expect(badge).toHaveText('1')
    const box = await boxOf(page, 'touch-next_charge_size')
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(TOUCH_TARGET_PX)
    const before = (await actionStream(page)).length
    await badge.tap()
    await expect(badge).toHaveText('4')
    const middle = (await actionStream(page)).length
    await page.keyboard.press('KeyV')
    await page.touchscreen.tap(currentCell().viewport.width / 2, 40)
    await expect(badge).toHaveText('1')
    const stream = await actionStream(page)
    const onTouch = stream.slice(before, middle)
    expect(onTouch.map((edge) => edge.actionId)).toContain('next_charge_size')
    expect(stream.slice(middle, middle + onTouch.length)).toEqual(onTouch)
    expect(errors).toEqual([])
  })
})

function tickNow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.snapshot.tick
  })
}

/** The page reports hidden, as an app switch does, then visible again; nothing is tapped yet. */
function hidePageAndComeBack(page: Page): Promise<void> {
  return page.evaluate(() => {
    const reportVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    reportVisibility('hidden')
    reportVisibility('visible')
    Reflect.deleteProperty(document, 'visibilityState')
  })
}

/** A P16 rig with a rack of size 4 charges only: Plant charge shows, the badge does not. */
async function stockOneChargeSize(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const debug = window.steampunkDebug!
    return [debug.setPlanet(16), debug.setCharges(1, 5, 4), debug.giveMoney('1e30')].flatMap(
      (result) => (result.ok ? [] : result.problems),
    )
  })
  expect(problems).toEqual([])
}

/** Two size 1 charges bought at the Upgrade bay, then back on the vehicle layer. */
async function stockSecondChargeSize(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const debug = window.steampunkDebug!
    const docked = debug.teleportToDock('upgrade')
    const at = debug.fastForward(1)
    if (!docked.ok || !at.ok) return ['could not dock at the Upgrade bay']
    const restocked = debug.fastForward(2, [
      { tick: at.tick + 1, type: 'restockCharges', payload: { size: 1, count: 2 } },
      { tick: at.tick + 2, type: 'undock', payload: {} },
    ])
    return restocked.ok ? [] : restocked.problems
  })
  expect(problems).toEqual([])
}

function clusterIds(page: Page): Promise<string[]> {
  return page
    .getByTestId('touch-cluster')
    .locator('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-testid') ?? ''))
}

function actionStream(page: Page): Promise<ActionEdge[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.input.getActionStream()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stream
  })
}

function isInside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 1 &&
    inner.top >= outer.top - 1 &&
    inner.right <= outer.right + 1 &&
    inner.bottom <= outer.bottom + 1
  )
}
