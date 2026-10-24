/**
 * The look set per screen (#173 "Screenshots"): each cell writes its review shots for the Game
 * Director, never compared (rulebook section 5: no pixel assertions). `npm run screens:update`
 * writes them to `docs/screens/<cell>/`; otherwise they land in the test's output folder.
 *
 * #173's set is the dock with both buildings, a dig with 3 chips and a discovery plaque, the
 * workshop mid-chain and the tech tree. The buildings landed with #175: the dock shot zooms out
 * over both, the yard and the car left on the Works' turntable. The workshop redo (#177) holds a
 * drill power chain for its shot. The chips (#178) and tech tree (#165) are not built yet, so the
 * set shoots a dig and the settings screen in their places; each ticket swaps its shot in when it
 * lands. The portrait cells shoot the same set held upright (ticket 488), and `rotated` turned
 * sideways mid-dig with no reload. `drill-wall` (ticket 789) is the tier-3 rig drilling sideways
 * into its shaft's lined wall: the drawn tip where the ground opens, not behind the casing.
 */
import { expect, test, type Page } from '@playwright/test'
import type { ScreenCell } from './screenCells'
import { currentCell, dockAt, openGame, renderStats, startDiggingDown } from './screenHelpers'
import { VIEW_SHORT_AXIS_DEFAULT_M, VIEW_SHORT_AXIS_MAX_M } from '../../../src/constants/scene'

const JPEG_QUALITY = 80
/** A native 4K frame on software WebGL takes seconds; the shot waits for drawn ground, then this. */
const GROUND_SETTLE_MS = 3000
/** The buildings' atlases are uploaded once the renderer's texture count holds for this long. */
const ART_SETTLE_MS = 3000
/** Held upright, the share of the height down to open ground, above the stick zone's 45%. */
const UPRIGHT_TAP_HEIGHT_SHARE = 0.4
/** The on-curve steps at the end of planet 2 (`onCurveSteps(2)`): visual tier 3, the widest head. */
const TIER_3_STEPS = {
  drill_power: 15,
  drill_tip: 100,
  engine: 5,
  boiler: 5,
  cargo_hold: 24,
  hull: 80,
} as const
const CASING_GRADE = 1
/**
 * The 0.9 m body has 0.5 m of air to the 1.9 m shaft's wall (`sideClearanceMm`), the lining 0.25 m
 * past it: shot with the head in the lining, judged once the body is a whole cell through it.
 */
const WALL_SHOT_MM = 600
const WALL_CUT_MM = 1200
/** Software WebGL on a loaded box drills slowly; a wait, not a judgement. */
const WALL_CUT_TIMEOUT_MS = 120_000

test.describe('screen matrix: review shots (#173)', () => {
  test('writes the look set for this screen', async ({ page }) => {
    test.setTimeout(600_000)
    const cell = currentCell()
    const errors = await openGame(page, cell)
    await page.evaluate(() => window.steampunkDebug!.ui.setRenderScale(1))
    await dismissTransmission(page)
    await waitForGround(page)
    await standOnTheTurntable(page)
    await shoot(page, 'dock')
    await backToTheSellBay(page)
    await digDown(page)
    await waitForGround(page)
    await shoot(page, 'dig')
    const shaft = await lineTheShaftAtTier3(page)
    await drillSidewaysPast(page, shaft, WALL_SHOT_MM)
    await shoot(page, 'drill-wall')
    await drillSidewaysPast(page, shaft, WALL_CUT_MM)
    await page.evaluate(() => window.steampunkDebug!.input.release('aim_left'))
    await dockAt(page, 'upgrade')
    await holdMidChain(page)
    await shoot(page, 'workshop')
    await page.evaluate(() => window.steampunkDebug!.ui.closeSheet())
    await page.getByTestId('platform-settings').click()
    await expect(page.getByTestId('settings-panel')).toBeVisible()
    await shoot(page, 'settings')
    if (cell.isPortrait) await shootTurnedMidDig(page)
    expect(errors).toEqual([])
  })
})

/** The workshop mid-chain (#177): a drill power hold, shot once it has climbed past its wind-up. */
async function holdMidChain(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.steampunkDebug!.giveMoney('1e9')
    window.steampunkDebug!.features.workshop.holdBuy('drill_power', 30)
  })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const chain = window.steampunkDebug!.features.workshop.getChain() as unknown as {
          hold: { steps: number } | null
        }
        return chain.hold?.steps ?? 0
      }),
    )
    .toBeGreaterThanOrEqual(6)
}

/** Any key takes the opening transmission down; on touch, a tap brings the controls back. */
async function dismissTransmission(page: Page): Promise<void> {
  await page.keyboard.press('KeyX')
  if (currentCell().isTouch) await page.touchscreen.tap(...controlsTapPointOf(currentCell()))
}

/**
 * The top edge's middle sideways. Held upright the top is the compact HUD's rows, whose boxes open
 * a card on a tap, so the tap lands on the ground above the stick zone instead.
 */
function controlsTapPointOf(cell: ScreenCell): [number, number] {
  const upright: [number, number] = [
    cell.viewport.width / 2,
    cell.viewport.height * UPRIGHT_TAP_HEIGHT_SHARE,
  ]
  return cell.isPortrait ? upright : [cell.viewport.width / 2, 20]
}

/** Upright, then turned sideways mid-dig with no reload (ticket 488): the game laid out again. */
async function shootTurnedMidDig(page: Page): Promise<void> {
  const { width, height } = currentCell().viewport
  await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
  await startDiggingDown(page)
  await page.setViewportSize({ width: height, height: width })
  await waitForGround(page)
  await shoot(page, 'rotated')
  await page.evaluate(() => window.steampunkDebug!.input.release('aim_down'))
}

/** Both buildings in view (#175): zoomed out, the car left on the Works' turntable. */
async function standOnTheTurntable(page: Page): Promise<void> {
  await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_MAX_M)
  await dockAt(page, 'upgrade')
  // Docking opens the Outfitter on the base sheet (ticket 687); shut it, then leave the bay.
  await page.evaluate(() => {
    window.steampunkDebug!.ui.closeSheet()
    window.steampunkDebug!.input.tap('ui_cancel')
  })
  await waitForArt(page)
}

/** The dig starts where a run does, on the Sell bay at the default zoom. */
async function backToTheSellBay(page: Page): Promise<void> {
  await page.evaluate((zoom) => window.steampunkDebug!.ui.setZoom(zoom), VIEW_SHORT_AXIS_DEFAULT_M)
  await dockAt(page, 'sell')
  await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
}

async function waitForArt(page: Page): Promise<void> {
  let previous = -1
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(ART_SETTLE_MS)
        const memory = await page.evaluate(() => window.steampunkDebug!.ui.getRendererMemory())
        const textures = memory.ok ? memory.textures : -1
        const isSettled = textures > 0 && textures === previous
        previous = textures
        return isSettled
      },
      { timeout: 240_000 },
    )
    .toBe(true)
}

/** A strong drill, a short drive off the pad and four seconds straight down. */
async function digDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    debug.setUpgrade('drill_power', 8)
    debug.setUpgrade('drill_tip', 120)
    debug.setUpgrade('engine', 6)
    debug.input.press('aim_left')
  })
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    window.steampunkDebug!.input.release('aim_left')
    window.steampunkDebug!.input.press('aim_down')
  })
  await page.waitForTimeout(4000)
  await page.evaluate(() => window.steampunkDebug!.input.release('aim_down'))
}

interface RigSpot {
  x: number
  y: number
}

/** The rig at visual tier 3 (#789 repro), a ring of lining round it where it stands in the shaft. */
async function lineTheShaftAtTier3(page: Page): Promise<RigSpot> {
  const spot = await page.evaluate(
    ({ steps, grade }) => {
      const debug = window.steampunkDebug!
      for (const [track, step] of Object.entries(steps)) debug.setUpgrade(track, step)
      const snapshot = debug.snapshot()
      if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
      const pose = Object.values(snapshot.snapshot.state.players)[0].vehicle.pose
      if (pose === null) throw new Error('the vehicle has no pose')
      const lined = debug.lineCasing(pose.x, pose.y, grade)
      if (!lined.ok) throw new Error(lined.problems.join('; '))
      return { x: pose.x, y: pose.y }
    },
    { steps: TIER_3_STEPS, grade: CASING_GRADE },
  )
  expect(await visualTierOf(page)).toBe(3)
  return spot
}

/** Left held until the rig's centre is `distanceMm` from where it stood in the shaft. */
async function drillSidewaysPast(page: Page, shaft: RigSpot, distanceMm: number): Promise<void> {
  await page.evaluate(() => window.steampunkDebug!.input.press('aim_left'))
  await expect
    .poll(() => distanceFromMm(page, shaft), { timeout: WALL_CUT_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(distanceMm)
}

function distanceFromMm(page: Page, from: RigSpot): Promise<number> {
  return page.evaluate((spot) => {
    const snapshot = window.steampunkDebug!.snapshot()
    if (!snapshot.ok) throw new Error(snapshot.problems.join('; '))
    const pose = Object.values(snapshot.snapshot.state.players)[0].vehicle.pose
    return pose === null ? 0 : Math.hypot(pose.x - spot.x, pose.y - spot.y)
  }, from)
}

function visualTierOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const parts = window.steampunkDebug!.vehicleParts()
    return parts.ok ? parts.visualTier : 0
  })
}

/** The ground drawn around the rig; the review shot needs a picture, not settled counts. */
async function waitForGround(page: Page): Promise<void> {
  await expect
    .poll(async () => (await renderStats(page)).groundBlocks, { timeout: 240_000 })
    .toBeGreaterThan(0)
  await page.waitForTimeout(GROUND_SETTLE_MS)
}

async function shoot(page: Page, shot: string): Promise<void> {
  const cell = currentCell()
  const path = process.env.UPDATE_SCREENS
    ? `docs/screens/${cell.name}/${shot}.jpg`
    : test.info().outputPath(`${shot}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: JPEG_QUALITY })
}
