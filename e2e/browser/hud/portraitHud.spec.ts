/**
 * The upright phone HUD's second slice (#486, spec #470; the GD's split on #500): held upright the
 * threats are chips leading the prompts' row, and the status row (on the strip since ticket 684)
 * is glyphs and numbers with its words in the detail behind the gear button. On every upright cell, in the worst case with a threat at each
 * of the eight octants and three status chips, no two `data-hud` boxes overlap, every text sits
 * inside its box, every threat chip sits inside the prompts' row, none of them reaches the stick
 * zone or a touch button, the vehicle's body stays uncovered, and the overlay keeps its 16-card
 * cap. A tap on the gear button opens the detail with the chips' words. Geometry through the
 * DOM and `steampunkDebug` only; a cell that cannot reach the worst case fails, never skips.
 */
import { expect, test, type Page } from '@playwright/test'
import { OVERLAY_CARD_CAP } from '../../../src/constants/screen'
import {
  hudBoxes,
  isInside,
  openGame,
  overlappingPairs,
  reachWorstCase,
  spilledTexts,
  stickZone,
  vehicleBox,
  type HudLayoutCell,
  type MeasuredBox,
} from './hudLayoutHelpers'

/** The reference phones held upright (#484's cells) and the upright small-phone sweep. */
const UPRIGHT_CELLS: readonly HudLayoutCell[] = [
  { name: 'phone-portrait', viewport: { width: 390, height: 844 }, floor: 0.7 },
  { name: 'pixel-portrait', viewport: { width: 412, height: 915 }, floor: 0.7 },
  { name: 'sweep-360x640', viewport: { width: 360, height: 640 }, floor: null },
  { name: 'sweep-320x568', viewport: { width: 320, height: 568 }, floor: null },
].map((cell) => ({ ...cell, isTouch: true, isTvMode: false }))

/** One threat marker at each octant, past the one the worst case stages at octant 2. */
const OTHER_OCTANTS = [0, 1, 3, 4, 5, 6, 7]
const SAMPLES = 8
const SAMPLE_GAP_MS = 250
/** Software WebGL on a loaded box is slow; these are waits, not judgements. */
const TEST_TIMEOUT_MS = 300_000
const SLACK_PX = 0.5

for (const cell of UPRIGHT_CELLS) {
  test.describe(`upright HUD rows (#486): ${cell.name}`, () => {
    test.use({ viewport: cell.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })

    test('keeps the threat chips, the prompts and the status row apart, every text inside its box', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGame(page, cell)
      await reachEveryThreat(page, cell)
      for (let sample = 0; sample < SAMPLES; sample++) {
        expect(await overlappingPairs(page), `sample ${sample}`).toEqual([])
        expect(await coveringVehicle(page), `sample ${sample}`).toEqual([])
        await page.waitForTimeout(SAMPLE_GAP_MS)
      }
      expect(await spilledTexts(page)).toEqual([])
      expect(errors).toEqual([])
    })

    test('draws every threat as a chip in the prompts row, off the stick zone and the controls', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openGame(page, cell)
      await reachEveryThreat(page, cell)
      const boxes = await hudBoxes(page)
      const threats = boxes.filter((box) => box.id === 'threat')
      const [prompts] = boxes.filter((box) => box.id === 'prompts')
      expect(threats).toHaveLength(OTHER_OCTANTS.length + 1)
      expect(threats.filter((threat) => !isInside(threat, prompts))).toEqual([])
      const zone = await stickZone(page)
      expect(zone).not.toBeNull()
      const keepOut = [zone!, ...boxes.filter((box) => box.id === 'control')]
      const rows = [prompts, ...boxes.filter((box) => box.id === 'strip')]
      expect(namesOverlapping(rows, keepOut)).toEqual([])
    })

    test('says every status word in the detail the gear button opens, none on the strip', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openGame(page, cell)
      await reachEveryThreat(page, cell)
      await expect(page.locator('[data-hud="strip"]')).not.toContainText('HULL CRITICAL')
      await page.getByTestId('hud-gear').tap()
      const detail = page.getByTestId('hud-detail')
      await expect(detail).toContainText('HULL CRITICAL')
      await expect(detail).toContainText('CRITICAL ENERGY')
    })

    test('keeps the overlay to its cap of 16 cards held upright', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      await openGame(page, cell)
      await reachEveryThreat(page, cell)
      for (let sample = 0; sample < SAMPLES; sample++) {
        expect(await seatedOverlayCards(page)).toBeLessThanOrEqual(OVERLAY_CARD_CAP)
        await page.waitForTimeout(SAMPLE_GAP_MS)
      }
    })
  })
}

/** The worst case (#500), then a threat at every octant and three status chips over it. */
async function reachEveryThreat(page: Page, cell: HudLayoutCell): Promise<void> {
  await reachWorstCase(page, cell)
  await page.evaluate((octants) => {
    const debug = window.steampunkDebug!
    for (const result of [
      debug.ui.stageHud({ isCargoFull: true, threatOctant: 2, threatOctants: octants }),
      debug.setHull('1'),
      debug.setEnergy('1'),
    ]) {
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  }, OTHER_OCTANTS)
  await expect(page.locator('[data-hud="threat"]')).toHaveCount(OTHER_OCTANTS.length + 1)
  await expect(page.getByTestId('hud-status-hull_critical')).toHaveCount(1)
}

async function coveringVehicle(page: Page): Promise<string[]> {
  const vehicle = await vehicleBox(page)
  const boxes = await hudBoxes(page)
  return boxes.filter((box) => overlaps(box, vehicle)).map((box) => `${box.id}:${box.testId}`)
}

async function seatedOverlayCards(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getOverlayStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats.seated
  })
}

function namesOverlapping(boxes: readonly MeasuredBox[], keepOut: readonly MeasuredBox[]) {
  return boxes.flatMap((box) =>
    keepOut.filter((other) => overlaps(box, other)).map((other) => `${box.id} x ${other.id}`),
  )
}

function overlaps(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    a.left + SLACK_PX < b.right &&
    b.left + SLACK_PX < a.right &&
    a.top + SLACK_PX < b.bottom &&
    b.top + SLACK_PX < a.bottom
  )
}
