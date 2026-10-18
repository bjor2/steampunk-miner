/**
 * The debug flag panel on both phones (ticket 549, the TD ruling on #547 and its #548 ruling):
 * a player's launch opens it only from the hidden gesture, a 1.5 s press on the version label
 * inside the safe area, which marks the tab as a debug session; a switch is remembered across a
 * reload; the reset restores the shipped flags, clears the store and drops the badge; a player's
 * launch with a stored override and no marker ignores it; and `?debug` opens it with a tap.
 * Emulation, not a device (#482). State through the DOM's switches, the storage and
 * `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { DEV_FLAG_ROWS } from '../../../src/constants/devFlagRows'
import { boxOf } from '../screens/screenHelpers'
import { collectErrors, skipWhereEngineIsMissing } from './mobileHelpers'

const OVERRIDES_KEY = 'sm.devFlagOverrides.v1'
const MARKER_KEY = 'sm.debugSession.v1'
const HOLD_MS = 1500
const HEAT_SWITCH = 'dev-flag-switch-heat.workUncapped'
const HEAT_OFF = JSON.stringify({ 'heat.workUncapped': { isOn: false, defaultWhenSet: true } })

skipWhereEngineIsMissing()

/** A player's launch: the title menu, with no debug handle. */
async function openTitle(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`)
  await expect(page.getByTestId('version-label')).toBeVisible({ timeout: 120_000 })
}

/** A finger held on the version label past the gesture's 1.5 s, then lifted. */
async function holdVersionLabel(page: Page): Promise<void> {
  const label = page.getByTestId('version-label')
  const finger = { pointerType: 'touch', isPrimary: true, pointerId: 1 }
  await label.dispatchEvent('pointerdown', finger)
  await page.waitForTimeout(HOLD_MS + 300)
  await label.dispatchEvent('pointerup', finger)
}

function readStored(page: Page, key: string, area: 'local' | 'session') {
  return page.evaluate(
    ([name, where]) => (where === 'local' ? localStorage : sessionStorage).getItem(name),
    [key, area] as const,
  )
}

function isInside(
  inner: { left: number; top: number; right: number; bottom: number },
  outer: typeof inner,
) {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.right <= outer.right &&
    inner.bottom <= outer.bottom
  )
}

test.describe('mobile: debug flag panel (ticket 549)', () => {
  test('opens from the long press, remembers a switch across a reload, and resets', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    const errors = collectErrors(page)
    await openTitle(page)
    expect(isInside(await boxOf(page, 'version-label'), await boxOf(page, 'safe-area'))).toBe(true)
    await page.getByTestId('version-label').tap()
    await expect(page.getByTestId('dev-flag-panel')).toHaveCount(0)

    await holdVersionLabel(page)
    await expect(page.getByTestId('dev-flag-panel')).toBeVisible()
    expect(await readStored(page, MARKER_KEY, 'session')).not.toBeNull()
    await expect(page.locator('[data-testid^="dev-flag-row-"]')).toHaveCount(DEV_FLAG_ROWS.length)
    await expect(page.getByTestId(HEAT_SWITCH)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('dev-flag-badge')).toHaveCount(0)

    await page.getByTestId(HEAT_SWITCH).tap()
    await expect(page.getByTestId(HEAT_SWITCH)).toHaveAttribute('aria-checked', 'false')
    expect(JSON.parse((await readStored(page, OVERRIDES_KEY, 'local')) ?? '{}')).toEqual(
      JSON.parse(HEAT_OFF),
    )
    await expect(page.getByTestId('dev-flag-badge')).toHaveAttribute('data-count', '1')

    // The tab stays a debug session: the reload reads the override, and a tap opens the panel.
    await openTitle(page)
    await expect(page.getByTestId('dev-flag-badge')).toHaveAttribute('data-count', '1')
    await page.getByTestId('version-label').tap()
    await expect(page.getByTestId(HEAT_SWITCH)).toHaveAttribute('aria-checked', 'false')
    expect(isInside(await boxOf(page, 'dev-flag-reset'), await boxOf(page, 'safe-area'))).toBe(true)

    await page.getByTestId('dev-flag-reset').tap()
    await expect(page.getByTestId(HEAT_SWITCH)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('dev-flag-badge')).toHaveCount(0)
    expect(await readStored(page, OVERRIDES_KEY, 'local')).toBeNull()
    expect(await readStored(page, MARKER_KEY, 'session')).toBeNull()
    expect(errors).toEqual([])
  })

  test("ignores a stored override on a player's launch without the tab's marker", async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const errors = collectErrors(page)
    await openTitle(page)
    await page.evaluate(([key, text]) => localStorage.setItem(key, text), [OVERRIDES_KEY, HEAT_OFF])
    await openTitle(page)
    await expect(page.getByTestId('dev-flag-badge')).toHaveCount(0)
    await page.getByTestId('version-label').tap()
    await expect(page.getByTestId('dev-flag-panel')).toHaveCount(0)
    expect(await readStored(page, OVERRIDES_KEY, 'local')).toBe(HEAT_OFF)
    expect(errors).toEqual([])
  })

  test('opens from ?debug with a tap, its switch sent as the logged command', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = collectErrors(page)
    await openTitle(page, '?debug&title')
    await page.waitForFunction(() => window.steampunkDebug !== undefined, null, {
      timeout: 60_000,
    })
    await page.getByTestId('version-label').tap()
    await expect(page.getByTestId('dev-flag-panel')).toBeVisible()
    await page.getByTestId('dev-flag-switch-drill.exactCarry').tap()
    const flags = await page.evaluate(() => {
      const read = window.steampunkDebug!.ui.getDevFlags()
      if (!read.ok) throw new Error(read.problems.join('; '))
      return read.flags
    })
    expect(flags.authority['drill.exactCarry']).toBe(false)
    expect(flags.isEverSet).toBe(true)
    expect(flags.overrides).toEqual({
      'drill.exactCarry': { isOn: false, defaultWhenSet: true },
    })
    await expect(
      page.getByTestId('dev-flag-row-drill.reportEveryTick').getByRole('status'),
    ).toHaveCount(1)
    await page.getByTestId('dev-flag-reset').tap()
    await expect(page.getByTestId('dev-flag-badge')).toHaveCount(0)
    expect(errors).toEqual([])
  })
})
