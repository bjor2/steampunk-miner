/**
 * The drill-down run (ticket 416, the slow real-browser companion of the #409 ladder): on the
 * committed start save the vehicle drives off the dock pad onto the planet 1 surface and stops,
 * then the real Down key is held for 10 s of wall time. It watches and does not judge (GD on #416):
 * the only assertions are that the vehicle went down and did not stall at 0; #409 owns the strict
 * ladder. Each run writes one row under test-results/drill-down/ (start and end position in cells,
 * depth, depth gained, cells/s and m/s over the hold, drill level, seed, build commit, time), which
 * the box Tester appends to drill-down.ndjson on the test-metrics branch
 * (scripts/ci/recordDrillDown.mjs) for the status page's Tests tab. Box Tester slow tier and
 * nightly only, never on build workers.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
    steampunkRunLog?: () => string
  }
}

const START_SAVE_TEXT = readFileSync(
  new URL('../../scenarios/drill-down-start.scenario.json', import.meta.url),
  'utf8',
)
const START_SAVE = JSON.parse(START_SAVE_TEXT) as {
  worldSeed: number
  start: { planet: number; upgrades: { drill_power: number } }
}
/** Read by scripts/ci/recordDrillDown.mjs, relative to the checkout. */
const ROWS_DIR = new URL('../../test-results/drill-down/', import.meta.url)
const ROW_SCHEMA = 1
/** The start save's level, then the second run set through the debug API (GD on #416). */
const DRILL_LEVELS = [START_SAVE.start.upgrades.drill_power, 10]
const HOLD_MS = 10_000
/** Seed 83921's dock pad ends at column 12 (`dockSiteOf`); four cells clear of it is open ground. */
const OFF_PAD_COLUMN = 16
/** At rest: under 5 cm/s each way, the dock's own stationary bound (`DOCK_STATIONARY_MM_PER_SECOND`). */
const AT_REST_MM_PER_SECOND = 50
/** Software WebGL on a loaded box drives slowly; these are waits, not judgements. */
const DRIVE_OFF_TIMEOUT_MS = 60_000
const SETTLE_TIMEOUT_MS = 20_000
const TEST_TIMEOUT_MS = 180_000
const MM_PER_METRE = 1000

interface VehicleSpot {
  tick: number
  mode: string
  /** Planet metres (1 cell = 1 m) of the last reported pose; the planet's centre is the origin. */
  x: number
  y: number
  vxMm: number
  vyMm: number
  /** Whole cells below the surface, the HUD's depth. */
  depthTiles: number
}

interface DrillDownRun {
  drillLevel: number
  buildCommit: string
  measuredAt: string
  holdMs: number
  start: VehicleSpot
  end: VehicleSpot
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

/** Nothing to fight, so the ground alone decides the run; level 1 is the save's own. */
async function prepareRig(page: Page, drillLevel: number): Promise<void> {
  const problems = await page.evaluate(
    ({ level, isSaveLevel }) => {
      const debug = window.steampunkDebug!
      const results = [debug.freezeEnemies(true)]
      if (!isSaveLevel) results.push(debug.setUpgrade('drill_power', level))
      return results.flatMap((result) => (result.ok ? [] : result.problems))
    },
    { level: drillLevel, isSaveLevel: drillLevel === START_SAVE.start.upgrades.drill_power },
  )
  expect(problems).toEqual([])
}

function readVehicleSpot(page: Page): Promise<VehicleSpot> {
  return page.evaluate((mmPerMetre) => {
    const debug = window.steampunkDebug!
    const snapshot = debug.snapshot()
    const hud = debug.ui.getHudModel()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    if (!hud.ok) throw new Error(hud.problems.join('; '))
    const vehicle = Object.values(snapshot.snapshot.state.players)[0].vehicle
    if (vehicle.pose === null) throw new Error('the vehicle has no pose')
    return {
      tick: snapshot.snapshot.tick,
      mode: vehicle.mode,
      x: vehicle.pose.x / mmPerMetre,
      y: vehicle.pose.y / mmPerMetre,
      vxMm: vehicle.pose.vx,
      vyMm: vehicle.pose.vy,
      depthTiles: hud.model.depth.depthTiles,
    }
  }, MM_PER_METRE)
}

const isAtRest = (spot: VehicleSpot) =>
  Math.max(Math.abs(spot.vxMm), Math.abs(spot.vyMm)) < AT_REST_MM_PER_SECOND

/** Off the pad (the pad is the one cell a drill never removes) and stopped on the surface. */
async function driveOffThePad(page: Page): Promise<void> {
  const { mode } = await readVehicleSpot(page)
  // The dock screen's cancel undocks (dockRules.ts); a docked vehicle ignores the aim actions.
  if (mode === 'docked') await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
  await page.evaluate(() => window.steampunkDebug!.input.press('aim_right'))
  await expect
    .poll(async () => (await readVehicleSpot(page)).x, { timeout: DRIVE_OFF_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(OFF_PAD_COLUMN)
  await page.evaluate(() => window.steampunkDebug!.input.release('aim_right'))
  await expect
    .poll(async () => isAtRest(await readVehicleSpot(page)), { timeout: SETTLE_TIMEOUT_MS })
    .toBe(true)
}

/** The commit the preview was built from, as the run log's `game_started` names it. */
function readBuildCommit(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lines = (window.steampunkRunLog?.() ?? '').split('\n').filter(Boolean)
    const events = lines.map(
      (line) => JSON.parse(line) as { event: string; data?: { buildCommit?: string } },
    )
    const started = events.find((event) => event.event === 'game_started')
    return started?.data?.buildCommit ?? 'unknown'
  })
}

/**
 * The real Down key held for 10 s; the end is read before the key comes up, so the hold is the
 * whole window. The pose is the last report, at most 12 ticks (0.2 s) old (`poseReport.ts`).
 */
async function holdDownKey(page: Page, drillLevel: number): Promise<DrillDownRun> {
  const start = await readVehicleSpot(page)
  const measuredAt = new Date().toISOString()
  const heldFrom = Date.now()
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(HOLD_MS)
  const end = await readVehicleSpot(page)
  const holdMs = Date.now() - heldFrom
  await page.keyboard.up('ArrowDown')
  const buildCommit = await readBuildCommit(page)
  return { drillLevel, buildCommit, measuredAt, holdMs, start, end }
}

const roundTo3 = (value: number) => Math.round(value * 1000) / 1000
const spotOf = (spot: VehicleSpot) => ({
  x: roundTo3(spot.x),
  y: roundTo3(spot.y),
  depthTiles: spot.depthTiles,
})

/** One history row (schema in scripts/ci/drillDownHistory.mjs). */
function drillDownRowOf(run: DrillDownRun) {
  const seconds = run.holdMs / 1000
  const depthGainedTiles = run.end.depthTiles - run.start.depthTiles
  // Toward the planet's centre at the origin, so it is the true descent wherever the column is.
  const descentMetres = Math.hypot(run.start.x, run.start.y) - Math.hypot(run.end.x, run.end.y)
  const travelMetres = Math.hypot(run.end.x - run.start.x, run.end.y - run.start.y)
  return {
    schema: ROW_SCHEMA,
    id: `${run.measuredAt}-L${run.drillLevel}`,
    measuredAt: run.measuredAt,
    buildCommit: run.buildCommit,
    seed: START_SAVE.worldSeed,
    planet: START_SAVE.start.planet,
    drillLevel: run.drillLevel,
    holdMs: run.holdMs,
    ticks: run.end.tick - run.start.tick,
    start: spotOf(run.start),
    end: spotOf(run.end),
    depthGainedTiles,
    descentMetres: roundTo3(descentMetres),
    cellsPerSecond: roundTo3(depthGainedTiles / seconds),
    speedMetresPerSecond: roundTo3(travelMetres / seconds),
  }
}

/** Written before the assertions, so a stalled run is in the history too. */
function writeRow(row: ReturnType<typeof drillDownRowOf>): void {
  mkdirSync(ROWS_DIR, { recursive: true })
  writeFileSync(new URL(`level-${row.drillLevel}.json`, ROWS_DIR), `${JSON.stringify(row)}\n`)
}

test.describe('drill-down run (ticket 416)', () => {
  for (const drillLevel of DRILL_LEVELS) {
    test(`holding Down for 10 s at drill level ${drillLevel} takes the vehicle below the P1 surface`, async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openStartSave(page)
      await prepareRig(page, drillLevel)
      await driveOffThePad(page)
      const row = drillDownRowOf(await holdDownKey(page, drillLevel))
      writeRow(row)
      await test.info().attach(`drill level ${drillLevel}`, {
        body: JSON.stringify(row, null, 2),
        contentType: 'application/json',
      })
      expect(row.depthGainedTiles).toBeGreaterThan(0)
      expect(row.descentMetres).toBeGreaterThan(0)
      expect(errors).toEqual([])
    })
  }
})
