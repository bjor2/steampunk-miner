/**
 * Multi-touch on the Pixel 7 project (ticket 481, the TD's section 5 on #470): two real fingers
 * through CDP spread on the open screen and press `zoom_in` into the action stream, as the Equal key
 * does, and a double tap presses `zoom_reset` and widens the view again. WebKit has no CDP, so the
 * iPhone 13 project skips these; the stick's stream equality runs on both phones from the screen
 * matrix's `touchControls.spec.ts`. State through `steampunkDebug`, never pixels.
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { cameraView, currentCell, openGame } from '../screens/screenHelpers'
import { actionStream, skipWhereEngineIsMissing, skipWithoutCdp } from './mobileHelpers'

/** Two fingers on the open screen, right of the stick zone and above the cluster. */
const PINCH_ROW_SHARE = 0.5
const PINCH_START_SHARES = [0.6, 0.7]
/** Spread to 2.6 times apart: four 1.25 steps of `pinchZoomStepsOf`. */
const PINCH_END_SHARES = [0.52, 0.78]
const PINCH_MOVES = 6

type TouchType = 'touchStart' | 'touchMove' | 'touchEnd'
interface Finger {
  x: number
  y: number
  id: number
}

skipWhereEngineIsMissing()

function sendTouch(cdp: CDPSession, type: TouchType, fingers: readonly Finger[]): Promise<unknown> {
  return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...fingers] })
}

function fingersAt(shares: readonly number[], progress: number, ends: readonly number[]): Finger[] {
  const { width, height } = currentCell().viewport
  return shares.map((share, index) => ({
    x: width * (share + (ends[index] - share) * progress),
    y: height * PINCH_ROW_SHARE,
    id: index + 1,
  }))
}

async function spreadTwoFingers(cdp: CDPSession): Promise<void> {
  await sendTouch(cdp, 'touchStart', fingersAt(PINCH_START_SHARES, 0, PINCH_END_SHARES))
  for (let move = 1; move <= PINCH_MOVES; move++) {
    const fingers = fingersAt(PINCH_START_SHARES, move / PINCH_MOVES, PINCH_END_SHARES)
    await sendTouch(cdp, 'touchMove', fingers)
  }
  await sendTouch(cdp, 'touchEnd', [])
}

async function doubleTap(cdp: CDPSession): Promise<void> {
  const [finger] = fingersAt(PINCH_START_SHARES, 0, PINCH_END_SHARES)
  for (let tap = 0; tap < 2; tap++) {
    await sendTouch(cdp, 'touchStart', [finger])
    await sendTouch(cdp, 'touchEnd', [])
  }
}

async function viewMetres(page: Page): Promise<number> {
  return (await cameraView(page)).viewShortAxisMetres
}

test.describe('mobile: multi-touch gestures (ticket 481)', () => {
  test('zooms in on a two-finger spread as the Equal key does, and resets on a double tap', async ({
    page,
    browserName,
  }) => {
    skipWithoutCdp(browserName)
    const errors = await openGame(page, currentCell())
    const cdp = await page.context().newCDPSession(page)
    const startMetres = await viewMetres(page)
    const before = (await actionStream(page)).length
    await spreadTwoFingers(cdp)
    const onPinch = (await actionStream(page)).slice(before)
    expect(onPinch.map((edge) => edge.actionId)).toContain('zoom_in')
    expect(onPinch.map((edge) => edge.actionId)).not.toContain('zoom_out')
    await expect.poll(() => viewMetres(page)).toBeLessThan(startMetres)
    const pinchedMetres = await viewMetres(page)
    const reset = (await actionStream(page)).length
    await doubleTap(cdp)
    const onDoubleTap = (await actionStream(page)).slice(reset).map((edge) => edge.actionId)
    expect(onDoubleTap).toContain('zoom_reset')
    await expect.poll(() => viewMetres(page)).toBeGreaterThan(pinchedMetres)
    // Last: a key hides the touch controls until the next touch.
    const middle = (await actionStream(page)).length
    await page.keyboard.press('Equal')
    expect((await actionStream(page)).slice(middle)[0]).toEqual(onPinch[0])
    expect(errors).toEqual([])
  })
})
