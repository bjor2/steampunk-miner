/**
 * What the mobile projects' specs share (ticket 481): skipping cleanly where an engine is missing
 * or has no CDP, reading the run log and the action stream, and opening the debug build. State
 * through `window.steampunkDebug` and `window.steampunkRunLog()`, never pixels.
 */
import { test, type Page } from '@playwright/test'
import type { DebugApi } from '../../../src/debug/debugApi'
import type { ActionEdge } from '../../../src/store/inputRuntime'
import { ENGINE_MISSING_MESSAGE, isEngineInstalled } from './mobileDevices'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

export interface LoggedLine {
  event: string
  data: Record<string, number | string>
}

export const NO_CDP_MESSAGE =
  'WebKit has no CDP: multi-touch and CPU throttling run on the Chromium Pixel 7 duplicate'

/**
 * Call at a spec file's top level: on a machine without WebKit the iPhone 13 project's tests skip
 * with the install hint before any browser launches, so `test:e2e:affected` stays green.
 */
export function skipWhereEngineIsMissing(): void {
  test.skip(({ browserName }) => !isEngineInstalled(browserName), ENGINE_MISSING_MESSAGE)
}

/** Inside a test that drives CDP (multi-touch, throttling): WebKit skips with the reason. */
export function skipWithoutCdp(browserName: string): void {
  test.skip(browserName !== 'chromium', NO_CDP_MESSAGE)
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

/** `?debug` opens straight into play; `?debug&title` on the title menu (ticket 403). */
export async function openDebugGame(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`)
  await page.waitForFunction(() => window.steampunkDebug?.getPhysicsStats().ok === true, null, {
    timeout: 120_000,
  })
}

/** The first run-log line named `event`, once it is written. */
export async function waitForLine(page: Page, event: string): Promise<LoggedLine> {
  const fragment = `"event":"${event}"`
  await page.waitForFunction((text) => window.steampunkRunLog!().includes(text), fragment, {
    timeout: 60_000,
    polling: 250,
  })
  const lines = await page.evaluate(() =>
    window.steampunkRunLog!()
      .split('\n')
      .filter((text) => text.length > 0)
      .map((text) => JSON.parse(text) as unknown),
  )
  return (lines as LoggedLine[]).find((line) => line.event === event)!
}

export function actionStream(page: Page): Promise<ActionEdge[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.input.getActionStream()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stream
  })
}

export function tapAction(page: Page, actionId: string): Promise<void> {
  return page.evaluate((action) => {
    const result = window.steampunkDebug!.input.tap(action)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, actionId)
}
