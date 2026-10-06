/**
 * The memory and frame samples of a `?debug` run (#121), on the preview build: while the vehicle
 * drives off the pad and drills, the run log gets a `memory_sample` every 10 s of frames with every
 * field, and each `perf_sample` carries the p99 frame and the long-frame count. Every line is
 * checked against the schema registry, as the comparison tool would read it.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { RUN_EVENT_REGISTRY } from '../../src/logging/eventNames'
import { runEventProblems } from '../../src/logging/runEventSchema'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

interface LoggedLine {
  event: string
  timestamp: number
  data: Record<string, number | string>
}

/** Two samples need 20 s of frames; software GL and a loaded box add their own stalls. */
const WAIT_FOR_SAMPLES_MS = 90_000
/** How late a sample may land behind its 10 s mark: a few slow software-GL frames. */
const LATE_FRAMES_S = 3
/** Long enough on software GL to drive off the pad before drilling down. */
const DRIVE_OFF_PAD_MS = 6000

/** Off the pad, then down: a drill that cuts at once and nothing to fight. */
async function openDrillingGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug!.getPhysicsStats().ok, null, {
    timeout: 60_000,
  })
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    for (const track of ['drill_power', 'drill_tip', 'engine']) debug.setUpgrade(track, 30)
    debug.freezeEnemies(true)
    debug.input.press('aim_right')
  })
  await page.waitForTimeout(DRIVE_OFF_PAD_MS)
  await page.evaluate(() => {
    window.steampunkDebug!.input.release('aim_right')
    window.steampunkDebug!.input.press('aim_down')
  })
  return errors
}

function readRunLog(page: Page): Promise<LoggedLine[]> {
  return page.evaluate(() =>
    window.steampunkRunLog!()
      .split('\n')
      .filter((text) => text.length > 0)
      .map((text) => JSON.parse(text)),
  )
}

async function waitForMemorySamples(page: Page, count: number): Promise<LoggedLine[]> {
  await page.waitForFunction(
    (wanted) => window.steampunkRunLog!().split('"event":"memory_sample"').length - 1 >= wanted,
    count,
    { timeout: WAIT_FOR_SAMPLES_MS, polling: 1000 },
  )
  return readRunLog(page)
}

function linesOf(lines: readonly LoggedLine[], event: string): LoggedLine[] {
  return lines.filter((line) => line.event === event)
}

test.describe('memory and frame samples (#121)', () => {
  test('logs a valid memory_sample every 10 s with every field, and perf_sample with p99 and long tasks', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openDrillingGame(page)
    const lines = await waitForMemorySamples(page, 2)
    expect(lines.flatMap(runEventProblems)).toEqual([])

    const memory = linesOf(lines, 'memory_sample')
    const fields = Object.keys(RUN_EVENT_REGISTRY.memory_sample.payload).sort()
    for (const { data } of memory) {
      expect(Object.keys(data).sort()).toEqual(fields)
      for (const count of ['jsHeapUsedKB', 'wasmKB', 'geometries', 'programs', 'colliders'])
        expect(data[count]).toBeGreaterThan(0)
      for (const count of ['rigidBodies', 'chunksCached', 'chunksMeshed', 'domNodes', 'listeners'])
        expect(data[count]).toBeGreaterThan(0)
    }
    // On the 10 s grid, late by at most a few software-GL frames (~0.5 s each), never early.
    memory.forEach(({ data }, index) => {
      expect(data.elapsedS).toBeGreaterThanOrEqual(10 * (index + 1))
      expect(data.elapsedS).toBeLessThanOrEqual(10 * (index + 1) + LATE_FRAMES_S)
    })
    expect(memory[1].data.maxDepthTiles).toBeGreaterThan(0)
    expect(memory[1].data.tilesDestroyed).toBeGreaterThan(0)
    const wallGap = memory[1].timestamp - memory[0].timestamp
    expect(wallGap).toBeGreaterThan(8)
    expect(wallGap).toBeLessThan(15)

    const frames = linesOf(lines, 'perf_sample')
    expect(frames.length).toBeGreaterThan(5)
    for (const { data } of frames) {
      expect(data.frameMsP99).toBeGreaterThanOrEqual(data.frameMsP95 as number)
      expect(Number.isSafeInteger(data.longTasks)).toBe(true)
    }
    expect(errors).toEqual([])
  })
})
