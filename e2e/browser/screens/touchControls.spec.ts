/**
 * The touch controls in the touch cells (#173: the TD amendment and Gameplay & Vehicle's five
 * acceptance points): sizes and clearances, the stick and the keys pressing the same action
 * stream, the cluster following the situation, the left-handed mirror, and the keyboard hiding
 * them until the next touch. Every screen is reached by taps alone. Driven by real touch events.
 */
import { expect, test, type Page } from '@playwright/test'
import type { ActionEdge } from '../../../src/store/inputRuntime'
import { boxOf, currentCell, hudPanelBoxes, openGame, overlaps, type Box } from './screenHelpers'

const INTERACT_PX = 72
const CLUSTER_PX = 56
/** At least this much between two hit boxes (G&V layout). */
const CLUSTER_GAP_PX = 8

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
