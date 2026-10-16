/**
 * The `perf:phone` lane (#470 P1-10, ticket 481; the TD's section 5 on #470): the Pixel 7 project
 * with the CPU slowed 4x and 6x through CDP (`Emulation.setCPUThrottlingRate`), on planet 1
 * parked, at 96 m/s and at 3600 m/s (`perfPhonePlan.json`). Per rate and case it writes, to
 * `test-results/perf-phone/cpu<rate>x.json`:
 *
 * - `tickMsP95`: one fixed tick's cost, each of 60 ticks stepped alone through the debug `step(1)`
 *   with the live step held, the driving input held down; the sim's CPU cost, no frame around it;
 * - over 15 s of live play after that: `ticksDroppedByCap`, the due ticks the 30-step cap of
 *   `MAX_STEPS_PER_FRAME` let go (time dilation), summed from the window's `perf_sample` lines,
 *   which count them since ticket 480; then `frameMsP95`, the render stats' last second;
 * - once the adaptive scale settles (or a minute passes): `renderScale`, `internalWidth` and
 *   `internalHeight`, `jsHeapMB` (CDP `Runtime.getHeapUsage`) and `domNodes`
 *   (`Memory.getDOMCounters`).
 *
 * Report only, never gated: `npm run perf:phone` runs it with `PERF_PHONE=1`, then records each
 * file with `perf:record --source e2e`. Throttled SwiftShader gives tick cost (CPU) numbers only;
 * GPU numbers come from the real-device check (#482). Elsewhere it skips, saying so.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { test, type CDPSession, type Page } from '@playwright/test'
import type { RenderStats } from '../../../src/debug/debugScreens'
import { PERF_PHONE_PROJECT } from './mobileDevices'
import { collectErrors, openDebugGame, skipWhereEngineIsMissing } from './mobileHelpers'

interface PhoneCase {
  id: string
  speedMetresPerSecond: number
  /** Stored levels by upgrade id; null leaves the rig parked on the pad. */
  levels: Record<string, number> | null
}

const PLAN = JSON.parse(readFileSync(new URL('./perfPhonePlan.json', import.meta.url), 'utf8')) as {
  cpuThrottleRates: number[]
  cases: PhoneCase[]
}

/** Read by `scripts/perf/perfPhone.mjs`, relative to the checkout. */
const RESULTS_DIR = new URL('../../../test-results/perf-phone/', import.meta.url)
/** The case's rig drives off the pad this long (the TD's rigs, ticket 439), then down. */
const PAD_TICKS = 120
const TIMED_TICKS = 60
const LIVE_MS = 15_000
const SETTLE_MS = 60_000
const MIB = 1024 * 1024

interface PhoneCaseReading {
  id: string
  speedMetresPerSecond: number
  tickMsP95: number
  frameMsP95: number
  ticksDroppedByCap: number
  renderScale: number
  internalWidth: number
  internalHeight: number
  jsHeapMB: number
  domNodes: number
}

skipWhereEngineIsMissing()

test.beforeEach(() => {
  test.skip(process.env.PERF_PHONE !== '1', 'the phone perf lane runs under `npm run perf:phone`')
  test.skip(
    test.info().project.name !== PERF_PHONE_PROJECT,
    'CPU throttling is a Chromium CDP call',
  )
})

/** On planet 1 with nothing to fight, the case's levels set; the throttle comes after the load. */
async function openCase(page: Page, phoneCase: PhoneCase): Promise<void> {
  await openDebugGame(page, 'debug')
  await page.evaluate((levels) => {
    const debug = window.steampunkDebug!
    const results = [
      debug.freezeEnemies(true),
      ...Object.entries(levels ?? {}).map(([track, level]) => debug.setUpgrade(track, level)),
    ]
    const problems = results.flatMap((result) => (result.ok ? [] : result.problems))
    if (problems.length > 0) throw new Error(problems.join('; '))
  }, phoneCase.levels)
}

/** Held: off the pad to the left for the rig's pad ticks, then the down aim stays held. */
async function driveOffPadAndAimDown(page: Page, phoneCase: PhoneCase): Promise<void> {
  if (phoneCase.levels === null) return
  await page.evaluate((padTicks) => {
    const debug = window.steampunkDebug!
    debug.pause()
    debug.input.press('aim_left')
    debug.step(padTicks)
    debug.input.release('aim_left')
    debug.input.press('aim_down')
  }, PAD_TICKS)
}

/** Each tick stepped alone with the live step held: the p95 of their wall times, ms. */
function timeTicksP95(page: Page): Promise<number> {
  return page.evaluate((ticks) => {
    const debug = window.steampunkDebug!
    debug.pause()
    const times: number[] = []
    for (let tick = 0; tick < ticks; tick++) {
      const startMs = performance.now()
      const stepped = debug.step(1)
      times.push(performance.now() - startMs)
      if (!stepped.ok) throw new Error(stepped.problems.join('; '))
    }
    times.sort((a, b) => a - b)
    return times[Math.ceil(times.length * 0.95) - 1]
  }, TIMED_TICKS)
}

/** Live play for `LIVE_MS`: the ticks the frame cap dropped, as its `perf_sample` lines count them. */
async function liveTicksDropped(page: Page): Promise<number> {
  await page.evaluate(() => window.steampunkDebug!.resume())
  const startSeq = await newestLoggedSeq(page)
  await page.waitForTimeout(LIVE_MS)
  return ticksDroppedLoggedAfter(page, startSeq)
}

function newestLoggedSeq(page: Page): Promise<number> {
  return page.evaluate(() => {
    const lines = window.steampunkRunLog!().trim().split('\n')
    return (JSON.parse(lines[lines.length - 1]) as { seq: number }).seq
  })
}

/** The sum of `perf_sample.ticksDroppedByCap` (ticket 480) over the lines after `startSeq`. */
function ticksDroppedLoggedAfter(page: Page, startSeq: number): Promise<number> {
  return page.evaluate((after) => {
    const samples = window.steampunkRunLog!()
      .split('\n')
      .filter((text) => text.includes('"event":"perf_sample"'))
      .map((text) => JSON.parse(text) as { seq: number; data: { ticksDroppedByCap?: number } })
      .filter((line) => line.seq > after)
    if (samples.length === 0) throw new Error('no perf_sample line was logged in the live window')
    const counts = samples.map((line) => line.data.ticksDroppedByCap)
    if (counts.some((count) => count === undefined)) {
      throw new Error('perf_sample carries no ticksDroppedByCap: this build predates ticket 480')
    }
    return counts.reduce((sum: number, count) => sum + (count ?? 0), 0)
  }, startSeq)
}

/** The render stats once the adaptive scale settles, or after `SETTLE_MS` of live play. */
async function settledRenderStats(page: Page): Promise<RenderStats> {
  await page
    .waitForFunction(
      () => {
        const result = window.steampunkDebug!.ui.getRenderStats()
        return result.ok && result.stats.isRenderScaleSettled
      },
      null,
      { timeout: SETTLE_MS },
    )
    .catch(() => undefined)
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats
  })
}

async function throttleCpu(page: Page, rate: number): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  return cdp
}

async function memoryOf(cdp: CDPSession): Promise<{ jsHeapMB: number; domNodes: number }> {
  const heap = await cdp.send('Runtime.getHeapUsage')
  const dom = await cdp.send('Memory.getDOMCounters')
  return { jsHeapMB: heap.usedSize / MIB, domNodes: dom.nodes }
}

function readingOf(
  phoneCase: PhoneCase,
  ticks: { tickMsP95: number; ticksDroppedByCap: number },
  stats: RenderStats,
  memory: { jsHeapMB: number; domNodes: number },
): PhoneCaseReading {
  const { id, speedMetresPerSecond } = phoneCase
  const { frameMsP95, renderScale, internalWidth, internalHeight } = stats
  return {
    id,
    speedMetresPerSecond,
    ...ticks,
    frameMsP95,
    renderScale,
    internalWidth,
    internalHeight,
    ...memory,
  }
}

async function measureCase(page: Page, phoneCase: PhoneCase, rate: number) {
  await openCase(page, phoneCase)
  const cdp = await throttleCpu(page, rate)
  try {
    await driveOffPadAndAimDown(page, phoneCase)
    const tickMsP95 = await timeTicksP95(page)
    const ticksDroppedByCap = await liveTicksDropped(page)
    const ticks = { tickMsP95, ticksDroppedByCap }
    return readingOf(phoneCase, ticks, await settledRenderStats(page), await memoryOf(cdp))
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  }
}

function writeRateFile(rate: number, cases: PhoneCaseReading[]): void {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const file = new URL(`cpu${rate}x.json`, RESULTS_DIR)
  writeFileSync(file, `${JSON.stringify({ cpuThrottleRate: rate, cases }, null, 2)}\n`)
}

test.describe('perf:phone lane (ticket 481)', () => {
  for (const rate of PLAN.cpuThrottleRates) {
    test(`measures tick and frame cost at ${rate}x CPU throttle, parked, at 96 and 3600 m/s`, async ({
      page,
    }) => {
      test.setTimeout(30 * 60_000)
      const errors = collectErrors(page)
      const cases: PhoneCaseReading[] = []
      for (const phoneCase of PLAN.cases) cases.push(await measureCase(page, phoneCase, rate))
      writeRateFile(rate, cases)
      test.info().annotations.push({ type: 'page errors', description: errors.join(' | ') })
    })
  }
})
