/**
 * The shared UI parts (spec #422, build #423) on the example slice's demo page, on the preview
 * build: the brass tooltip opens on a mouse hover after about 200 ms and on keyboard focus, and
 * the steampunk scroll area hides the native scrollbar, keeps its content's width when the rail
 * shows, wakes its rail on a wheel scroll and fades it once idle. The page's clock is faked after
 * the game is up, so the delays are exact. Asserted through data-* state, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { SCROLL_RAIL_IDLE_MS, TOOLTIP_HOVER_MS } from '../../src/constants/uiParts'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const DEMO_SCREEN_ID = 'example.ui-parts'
const CARD_ID = `${DEMO_SCREEN_ID}.card`

async function openDemoPage(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  const opened = await page.evaluate(
    (id) => window.steampunkDebug!.ui.openScreen(id),
    DEMO_SCREEN_ID,
  )
  expect(opened).toEqual({ ok: true })
  await expect(page.getByTestId('ui-parts-demo')).toBeVisible()
  await page.clock.install()
  return errors
}

/** The scroll viewport's gutter and its content's width, as the layout-shift check reads them. */
function scrollWidths(page: Page) {
  return page.getByTestId('ui-parts-scroll').evaluate((frame) => {
    const viewport = frame.firstElementChild as HTMLElement
    const content = viewport.firstElementChild as HTMLElement
    return {
      gutterPx: viewport.offsetWidth - viewport.clientWidth,
      contentPx: content.getBoundingClientRect().width,
      scrollbarWidth: getComputedStyle(viewport).scrollbarWidth,
      scrollsBy: viewport.scrollHeight - viewport.clientHeight,
    }
  })
}

test.describe('shared UI parts (ticket 423)', () => {
  test('opens the brass tooltip after a 200 ms hover, not before, and at once on focus', async ({
    page,
  }) => {
    const errors = await openDemoPage(page)
    const card = page.locator(`[data-ui-text="${CARD_ID}"]`)
    const plate = page.locator(`[data-tooltip="${CARD_ID}"]`)
    await expect(plate).toBeHidden()

    await card.hover()
    await page.clock.runFor(TOOLTIP_HOVER_MS - 10)
    await expect(plate).toBeHidden()
    await page.clock.runFor(10)
    await expect(plate).toBeVisible()
    await expect(plate).toContainText('A heavier head on the same drive shaft.')

    await page.mouse.move(0, 0)
    await expect(plate).toBeHidden()

    await card.locator('button').focus()
    await expect(plate).toBeVisible()
    await card.locator('button').blur()
    await expect(plate).toBeHidden()
    expect(errors).toEqual([])
  })

  test('scrolls without a native scrollbar, keeps its width when the rail shows and fades it when idle', async ({
    page,
  }) => {
    const errors = await openDemoPage(page)
    const frame = page.getByTestId('ui-parts-scroll')
    const before = await scrollWidths(page)
    expect(before.scrollbarWidth).toBe('none')
    expect(before.gutterPx).toBe(0)
    expect(before.scrollsBy).toBeGreaterThan(0)
    await expect(frame).toHaveAttribute('data-scrollable', '')
    await expect(frame).toHaveAttribute('data-at-start', '')
    await expect(frame).not.toHaveAttribute('data-awake', '')

    await frame.hover()
    await page.mouse.wheel(0, 120)
    await expect(frame).toHaveAttribute('data-awake', '')
    await expect(frame).not.toHaveAttribute('data-at-start', '')
    const awake = await scrollWidths(page)
    expect(awake.gutterPx).toBe(0)
    expect(awake.contentPx).toBe(before.contentPx)

    await page.mouse.move(0, 0)
    await page.clock.runFor(SCROLL_RAIL_IDLE_MS + 50)
    await expect(frame).not.toHaveAttribute('data-awake', '')
    expect(errors).toEqual([])
  })
})
