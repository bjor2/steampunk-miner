/**
 * A slice's vehicle piece on the car (ticket 235, the #166 seam): the example slice's test piece
 * hangs the #166 echo sounder at `hull.roof.aft` once `features.example.mountTestPiece()` holds it
 * on, and comes off again. Asserted through `steampunkDebug.vehicleParts().mounted`, never pixels;
 * the shot of the mounted car is written to the test's output folder for review, never compared.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { VIEW_SHORT_AXIS_MIN_M } from '../../src/constants/scene'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const TEST_PIECE = {
  assetId: 'vehicle-item-power-echo-sounder',
  attachId: 'hull.roof.aft',
  partIds: ['sounder-hammer', 'sounder-horn'],
}
const JPEG_QUALITY = 80
/** The sounder's atlas uploads after the mount; the shot waits this long for it. */
const ART_SETTLE_MS = 3000

async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  return errors
}

function mountedParts(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleParts()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.mounted
  })
}

function setTestPiece(page: Page, action: 'mountTestPiece' | 'unmountTestPiece') {
  return page.evaluate((name) => window.steampunkDebug!.features.example![name]!(), action)
}

test.describe('vehicle pieces (ticket 235)', () => {
  test('hangs a registered test piece on the car at its attach point, and takes it off', async ({
    page,
  }) => {
    const errors = await openGame(page)
    expect(await mountedParts(page)).toEqual([])

    expect(await setTestPiece(page, 'mountTestPiece')).toEqual({ ok: true })
    await expect.poll(() => mountedParts(page)).toEqual([TEST_PIECE])
    await page.keyboard.press('KeyX')
    await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_MIN_M)
    await page.waitForTimeout(ART_SETTLE_MS)
    await page.screenshot({
      path: test.info().outputPath('vehicle-test-piece.jpg'),
      type: 'jpeg',
      quality: JPEG_QUALITY,
    })

    expect(await setTestPiece(page, 'unmountTestPiece')).toEqual({ ok: true })
    await expect.poll(() => mountedParts(page)).toEqual([])
    expect(errors).toEqual([])
  })
})
