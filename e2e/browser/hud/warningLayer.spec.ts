/**
 * The warning layer (spec #678, ticket 685): low hull, low fuel, a full hold and a collapse warn
 * as an edge glow, the readout's pulsing icon and a bell, never a text box. On the 360x640 phone
 * and the 1280x800 desktop a recorded run walks the hull and the fuel down the ladder (30, 15,
 * 0%), fills the hold and starts a collapse under the rig, and `ui.getWarnings()` must show each
 * tier fired exactly once per readout, however often the HUD re-reads. The glow carries no HUD
 * box, the HUD's measured boxes stay out of the middle band, and the desktop strip has room for
 * six status icons, the phone for three. State through `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugResult } from '../../../src/debug/debugScreens'
import type { WarningsReading } from '../../../src/debug/debugWarnings'
import type { HudCoverageReport } from '../../../src/systems/views/hudCoverageReport'
import { blockContaining, blockIdOf } from '../../../src/systems/world/collapseBlock'
import { UI_SHOT_CELLS } from '../ui/uiShotCells'
import { openGame } from './hudLayoutHelpers'

/** The phone the GD lock names and the smaller desktop (#689's cells). */
const CELLS = UI_SHOT_CELLS.filter((cell) =>
  ['phone-360x640', 'desktop-1280x800'].includes(cell.name),
)

/** Status icons the strip's row has room for (`layout.statusIcons`). */
const STATUS_ICONS_MAX = { phone: 3, desktop: 6 } as const

/** Ladder lines the run steps through, as shares of the whole: low, critical, empty. */
const LADDER_STEPS = [
  { share: 0.25, tier: 'low' },
  { share: 0.1, tier: 'critical' },
  { share: 0, tier: 'empty' },
] as const

/** A block this far below the rig: the ground it stands on (as the rig-look sweep does). */
const COLLAPSE_BELOW_MM = 2000

/** The HUD re-reads its model every SCREEN_REFRESH_MS; a few of those is a settled reading. */
const SETTLE_MS = 600

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 180_000

for (const cell of CELLS) {
  test.describe(`warning layer (ticket 685): ${cell.name}`, () => {
    test.use({
      viewport: cell.viewport,
      isMobile: cell.isTouch,
      hasTouch: cell.isTouch,
      deviceScaleFactor: 1,
    })

    test('fires each ladder tier exactly once per readout over a recorded run', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await page.keyboard.press('KeyH')
      const stats = await vehicleStatsOf(page)
      for (const step of LADDER_STEPS) {
        await setHullShare(page, stats.hullMax, step.share)
        await expectGlow(page, step.tier)
        await page.waitForTimeout(SETTLE_MS)
      }
      for (const step of LADDER_STEPS) {
        await setEnergyShare(page, stats.energyMax, step.share)
        await page.waitForTimeout(SETTLE_MS)
      }
      await stageFullHold(page)
      await warnOfCollapseUnderRig(page)
      await page.waitForTimeout(SETTLE_MS)
      const fired = (await warningsOf(page)).fired.map((each) => `${each.readoutId}:${each.tier}`)
      test.info().annotations.push({ type: 'warnings-fired', description: fired.join(', ') })
      expect(fired).toEqual([
        'hull:low',
        'hull:critical',
        'hull:empty',
        'fuel:low',
        'fuel:critical',
        'fuel:empty',
        'cargo:empty',
        'collapse:critical',
      ])
      expect(errors).toEqual([])
    })

    test('draws the glow with no HUD box and keeps every box out of the middle band', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openGame(page, cell)
      await page.keyboard.press('KeyH')
      const stats = await vehicleStatsOf(page)
      await setHullShare(page, stats.hullMax, 0.1)
      await expectGlow(page, 'critical')
      const glow = page.getByTestId('hud-edge-glow')
      await expect(glow).toHaveAttribute('data-readout', 'hull')
      expect(await glow.getAttribute('data-hud')).toBeNull()
      const hullDial = page.getByTestId('hud-dial-hull')
      await expect(hullDial).toHaveAttribute('data-tier', 'critical')
      // Ticket 716: at 10% of the hull left the dial's face is in its red zone.
      await expect(hullDial).toHaveAttribute('data-zone', 'red')
      const report = await coverageOf(page)
      expect(report.bandIntruderIds).toEqual([])
      expect(report.measuredPercent).toBeLessThanOrEqual(cell.budgetPercent)
    })

    test('shows the status icons the layout has room for, in priority order', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openGame(page, cell)
      await page.keyboard.press('KeyH')
      const stats = await vehicleStatsOf(page)
      await setHullShare(page, stats.hullMax, 0.1)
      await setEnergyShare(page, stats.energyMax, 0)
      await warnOfCollapseUnderRig(page)
      expectOk(
        await page.evaluate(() =>
          window.steampunkDebug!.ui.stageHud({ isCargoFull: true, threatOctant: 2 }),
        ),
      )
      const statuses = page.getByTestId('hud-statuses')
      await expect(statuses).toHaveAttribute('data-shown', String(STATUS_ICONS_MAX[cell.layout]))
      await expect(page.getByTestId('hud-status-hull_critical')).toHaveCount(1)
      await expect(page.getByTestId('hud-status-collapse')).toHaveCount(1)
    })
  })
}

interface RigLimits {
  hullMax: number
  energyMax: number
}

function vehicleStatsOf(page: Page): Promise<RigLimits> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.vehicleStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return { hullMax: Number(result.stats.hullMax), energyMax: result.stats.energyMax }
  })
}

/** The hull at `share` of its max; the empty tier is a sliver above 0, so the rig still stands. */
async function setHullShare(page: Page, hullMax: number, share: number): Promise<void> {
  const hull = share === 0 ? String(hullMax / 10000) : String(Math.floor(hullMax * share))
  expectOk(await page.evaluate((value) => window.steampunkDebug!.setHull(value), hull))
}

async function setEnergyShare(page: Page, energyMax: number, share: number): Promise<void> {
  const units = String(Math.floor(energyMax * share))
  expectOk(await page.evaluate((value) => window.steampunkDebug!.setEnergy(value), units))
}

async function stageFullHold(page: Page): Promise<void> {
  expectOk(
    await page.evaluate(() =>
      window.steampunkDebug!.ui.stageHud({ isCargoFull: true, threatOctant: null }),
    ),
  )
}

/** Starts the collapse of the ground block under the rig: its warning holds for 60 ticks. */
async function warnOfCollapseUnderRig(page: Page): Promise<void> {
  const pose = await page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const playerId = Object.keys(result.snapshot.state.players).sort()[0]
    return result.snapshot.state.players[playerId].vehicle.pose
  })
  if (pose === null) throw new Error('the rig has no pose')
  const block = blockIdOf(blockContaining({ xMm: pose.x, yMm: pose.y - COLLAPSE_BELOW_MM }))
  expectOk(await page.evaluate((id) => window.steampunkDebug!.forceCollapse(id), block))
}

function expectOk(result: DebugResult): void {
  if (!result.ok) throw new Error(result.problems.join('; '))
}

async function expectGlow(page: Page, tier: string): Promise<void> {
  await expect
    .poll(async () => (await warningsOf(page)).glow.tier, { message: `the glow reaches ${tier}` })
    .toBe(tier)
  await expect(page.getByTestId('hud-edge-glow')).toHaveAttribute('data-tier', tier)
}

function warningsOf(page: Page): Promise<WarningsReading> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getWarnings()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.warnings
  })
}

function coverageOf(page: Page): Promise<HudCoverageReport> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getHudCoverage()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.report
  })
}
