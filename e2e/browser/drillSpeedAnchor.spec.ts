/**
 * The L20 browser-bench anchor (ticket 560, item 8 of the #551 ticket C; bar (ii) of #552): the
 * felt speed down through planet 1's band-1 rock in the real browser, at drill_power purchase 1
 * (the start save's) and purchase 20, from the reported poses and the ticks they were reported at,
 * never wall time (software WebGL on a loaded box runs the clock slower than the wall).
 *
 * Acceptance (VS on #551): the ratio D(20) / D(1) lies in [60, 65] (the law's 62.4). The L20 speed
 * is reported against the target, 50 times the old L20 (83.9 m/s; the delivered value sits 2.7%
 * under at 39 sub-steps), with the band-1 hardness and the tip it was cut with. At L20 the rig
 * crosses band 1 in about a third of a second, so its speed is read between the first and the last
 * report inside band 1; the start of the hold (the first two cells, the body speeding up) is left
 * out at both levels. Box Tester only, never on build workers.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { blockHardness } from '../../src/systems/economy/oreEconomy'
import { toCanonical } from '../../src/systems/money'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const START_SAVE_TEXT = readFileSync(
  new URL('../../scenarios/drill-down-start.scenario.json', import.meta.url),
  'utf8',
)
const START_SAVE = JSON.parse(START_SAVE_TEXT) as {
  start: { planet: number; upgrades: { drill_power: number } }
}
const FIRST_PURCHASE = START_SAVE.start.upgrades.drill_power
const ANCHOR_PURCHASE = 20
const RATIO_BAND = { low: 60, high: 65 }
/** 50 times the old L20, m/s (#551), and VS's bench band round it: -2.7% to +0.5%. */
const TARGET_M_PER_S = 83.9
const TARGET_BAND = { below: 0.027, above: 0.005 }
const HOLD_MS = 10_000
/** Read from the third cell down: the body has its cut speed by then. */
const FROM_DEPTH_TILES = 2
const OFF_PAD_COLUMN = 16
const AT_REST_MM_PER_SECOND = 50
const DRIVE_OFF_TIMEOUT_MS = 60_000
const SETTLE_TIMEOUT_MS = 20_000
const TEST_TIMEOUT_MS = 240_000
const TICKS_PER_SECOND = 60
const MM_PER_METRE = 1000

/** One reported pose: where the report put the body, the tick it was charged to and its band. */
interface ReportSample {
  reportTick: number
  xMm: number
  yMm: number
  vxMm: number
  vyMm: number
  mode: string
  depthTiles: number
  band: number | null
  tipLevel: number
}

async function openStartSave(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`/?debug&scenario=${encodeURIComponent(START_SAVE_TEXT)}`)
  await page.waitForFunction(() => window.steampunkDebug?.getPhysicsStats().ok === true, null, {
    timeout: DRIVE_OFF_TIMEOUT_MS,
  })
  return errors
}

async function prepareRig(page: Page, purchase: number): Promise<void> {
  const problems = await page.evaluate(
    ({ level, isSaveLevel }) => {
      const debug = window.steampunkDebug!
      const results = [debug.freezeEnemies(true)]
      if (!isSaveLevel) results.push(debug.setUpgrade('drill_power', level))
      return results.flatMap((result) => (result.ok ? [] : result.problems))
    },
    { level: purchase, isSaveLevel: purchase === FIRST_PURCHASE },
  )
  expect(problems).toEqual([])
}

function readSample(page: Page): Promise<ReportSample> {
  return page.evaluate(() => {
    const debug = window.steampunkDebug!
    const snapshot = debug.snapshot()
    const hud = debug.ui.getHudModel()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    if (!hud.ok) throw new Error(hud.problems.join('; '))
    const vehicle = Object.values(snapshot.snapshot.state.players)[0].vehicle
    if (vehicle.pose === null) throw new Error('the vehicle has no pose')
    return {
      reportTick: vehicle.accountedTick,
      xMm: vehicle.pose.x,
      yMm: vehicle.pose.y,
      vxMm: vehicle.pose.vx,
      vyMm: vehicle.pose.vy,
      mode: vehicle.mode,
      depthTiles: hud.model.depth.depthTiles,
      band: hud.model.depth.band,
      tipLevel: vehicle.levels.drill_tip ?? 0,
    }
  })
}

const isAtRest = (sample: ReportSample) =>
  Math.max(Math.abs(sample.vxMm), Math.abs(sample.vyMm)) < AT_REST_MM_PER_SECOND

async function driveOffThePad(page: Page): Promise<void> {
  if ((await readSample(page)).mode === 'docked') {
    await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
  }
  await page.evaluate(() => window.steampunkDebug!.input.press('aim_right'))
  await expect
    .poll(async () => (await readSample(page)).xMm / MM_PER_METRE, {
      timeout: DRIVE_OFF_TIMEOUT_MS,
    })
    .toBeGreaterThanOrEqual(OFF_PAD_COLUMN)
  await page.evaluate(() => window.steampunkDebug!.input.release('aim_right'))
  await expect
    .poll(async () => isAtRest(await readSample(page)), { timeout: SETTLE_TIMEOUT_MS })
    .toBe(true)
}

/** Holds the real Down key and keeps each new report until the rig leaves band 1 or the hold ends. */
async function samplesOfDescent(page: Page): Promise<ReportSample[]> {
  const samples: ReportSample[] = []
  const heldFrom = Date.now()
  await page.keyboard.down('ArrowDown')
  while (Date.now() - heldFrom < HOLD_MS) {
    const sample = await readSample(page)
    if (sample.reportTick !== samples[samples.length - 1]?.reportTick) samples.push(sample)
    if (sample.band !== null && sample.band > 1) break
  }
  await page.keyboard.up('ArrowDown')
  return samples
}

/** Metres a second between the first and the last band-1 report from `FROM_DEPTH_TILES` down. */
function bandOneSpeedOf(samples: readonly ReportSample[]): number {
  const inBandOne = samples.filter(
    (sample) => sample.band === 1 && sample.depthTiles >= FROM_DEPTH_TILES,
  )
  expect(inBandOne.length, 'two reports inside band 1').toBeGreaterThanOrEqual(2)
  const first = inBandOne[0]
  const last = inBandOne[inBandOne.length - 1]
  const metres = Math.hypot(last.xMm - first.xMm, last.yMm - first.yMm) / MM_PER_METRE
  return metres / ((last.reportTick - first.reportTick) / TICKS_PER_SECOND)
}

async function feltSpeedAt(page: Page, purchase: number) {
  const errors = await openStartSave(page)
  await prepareRig(page, purchase)
  await driveOffThePad(page)
  const samples = await samplesOfDescent(page)
  expect(errors).toEqual([])
  return { metresPerSecond: bandOneSpeedOf(samples), tipLevel: samples[0].tipLevel }
}

const roundTo3 = (value: number) => Math.round(value * 1000) / 1000

test.describe('the L20 drill-speed anchor (ticket 560)', () => {
  test(`cuts band 1 at purchase ${ANCHOR_PURCHASE} between 60 and 65 times purchase ${FIRST_PURCHASE}`, async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const first = await feltSpeedAt(page, FIRST_PURCHASE)
    const anchor = await feltSpeedAt(page, ANCHOR_PURCHASE)
    const ratio = anchor.metresPerSecond / first.metresPerSecond
    const reading = {
      firstPurchaseMPerS: roundTo3(first.metresPerSecond),
      anchorMPerS: roundTo3(anchor.metresPerSecond),
      ratio: roundTo3(ratio),
      targetMPerS: TARGET_M_PER_S,
      offTarget: roundTo3(anchor.metresPerSecond / TARGET_M_PER_S - 1),
      isInTargetBand:
        anchor.metresPerSecond >= TARGET_M_PER_S * (1 - TARGET_BAND.below) &&
        anchor.metresPerSecond <= TARGET_M_PER_S * (1 + TARGET_BAND.above),
      bandOneHardness: toCanonical(blockHardness(START_SAVE.start.planet, 1)),
      tipLevel: anchor.tipLevel,
    }
    console.log(`L20 anchor: ${JSON.stringify(reading)}`)
    await test.info().attach('L20 anchor', {
      body: JSON.stringify(reading, null, 2),
      contentType: 'application/json',
    })
    expect(ratio).toBeGreaterThanOrEqual(RATIO_BAND.low)
    expect(ratio).toBeLessThanOrEqual(RATIO_BAND.high)
  })
})
