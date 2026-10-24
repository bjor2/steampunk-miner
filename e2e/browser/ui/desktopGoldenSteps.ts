/**
 * The steps of the full desktop golden suite (spec #678, ticket 772): the cells it runs, the debug
 * calls that set a golden up, the wide-bore rig, the P40 save's round trip through Export and
 * Import, and the reads it judges by (the strip's box, the long-mode hover plate, the dock's share).
 * State and geometry through the DOM and `steampunkDebug` only, never pixels.
 */
import { expect, type Page } from '@playwright/test'
import { DEVICE_UI_IDS } from '../../../src/ui/stage/deviceIds'
import { openGame, SLACK_PX, type HudLayoutCell } from '../hud/hudLayoutHelpers'
import { undock } from './uiShotSheets'

/** The rig a cell drives: as it starts, or the widest bore the build ships (#662). */
export type GoldenRig = 'stock' | 'wide-bore'

export interface GoldenCell extends HudLayoutCell {
  layout: 'phone' | 'desktop'
  rig: GoldenRig
}

/** Every 15th power of ten from 1 to 1e300, then the top itself. */
export const MONEY_STEPS = Array.from({ length: 21 }, (_, at) => `1e${at * 15}`)
export const LEVELS = [1, 99, 9999, 1_000_000]
export const P40 = 40
/** The shared formatter's widest figure (#681), the glyph aside; a hover never widens a chip. */
export const FIGURE_CHARS_MAX = 6
/** The long mode's most significant figures (`numbers.longSignificantFigures`, ticket 768). */
export const LONG_FIGURES_MAX = 12
/** The GD lock's cap on what the docked sheet covers of the play area (ticket 767). */
export const DOCK_SHARE_MAX = 0.25

const PLAIN = { isTvMode: false, floor: null } as const
const DESKTOP = { isTouch: false, layout: 'desktop', ...PLAIN } as const

/**
 * The ticket's three desktop sizes, then the widest bore at the narrowest of them, where a wide
 * rig leaves the HUD and the dock the least room.
 */
export const DESKTOP_GOLDEN_CELLS: readonly GoldenCell[] = [
  { name: 'desktop-1280x800', viewport: { width: 1280, height: 800 }, ...DESKTOP, rig: 'stock' },
  { name: 'desktop-1920x1080', viewport: { width: 1920, height: 1080 }, ...DESKTOP, rig: 'stock' },
  { name: 'desktop-2560x1440', viewport: { width: 2560, height: 1440 }, ...DESKTOP, rig: 'stock' },
  {
    name: 'desktop-1280x800-wide-bore',
    viewport: { width: 1280, height: 800 },
    ...DESKTOP,
    rig: 'wide-bore',
  },
]

/** The phone the desktop work must leave as it was. */
export const PHONE_GOLDEN_CELL: GoldenCell = {
  name: 'phone-360x640',
  viewport: { width: 360, height: 640 },
  isTouch: true,
  layout: 'phone',
  rig: 'stock',
  ...PLAIN,
}

/** The side cutters in the flank socket with their Mark 2 owned: two side cells a flank. */
const WIDE_BORE_GEAR = 'gear.side_cutters'
const WIDE_BORE_SLOTS = { 'drill.flank': WIDE_BORE_GEAR }
const WIDE_BORE_OWNED = [WIDE_BORE_GEAR, 'gear.side_cutters_mark_2']

export type DebugCall =
  | readonly ['giveMoney', string]
  | readonly ['setPlanet', number]
  | readonly ['setUpgrade', string, number]

export async function runDebug(page: Page, calls: readonly DebugCall[]): Promise<void> {
  await page.evaluate((list) => {
    const debug = window.steampunkDebug! as unknown as Record<
      string,
      (...values: unknown[]) => { ok: boolean; problems?: string[] }
    >
    for (const [name, ...values] of list) {
      const result = debug[name](...values)
      if (!result.ok) throw new Error(`${name}: ${(result.problems ?? []).join('; ')}`)
    }
  }, calls)
}

/** The debug build off the dock, the opening transmission down and the cell's rig fitted. */
export async function openGoldenGame(page: Page, cell: GoldenCell): Promise<string[]> {
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyK')
  if (cell.isTouch) await page.touchscreen.tap(cell.viewport.width / 2, cell.viewport.height / 2)
  await undock(page)
  if (cell.rig === 'wide-bore') await fitWideBore(page)
  return errors
}

/** The tracks that cut fast enough for a drilling golden, as the screen matrix's dig sets them. */
const DIG_TRACKS = ['drill_power', 'drill_tip', 'engine']
const DIG_LEVEL = 300
/** Off the pad, which the drill does not cut, onto open ground (as the drill-down run does). */
const DRIVE_OFF_PAD_MS = 3000

/**
 * Off the pad and drilling down on the planet the cell starts on, the rig left as fitted (the
 * screen matrix's `startDiggingDown` resets the planet, which a wide-bore golden must not risk).
 */
export async function digDown(page: Page): Promise<void> {
  await runDebug(
    page,
    DIG_TRACKS.map((track) => ['setUpgrade', track, DIG_LEVEL] as const),
  )
  await page.evaluate(() => window.steampunkDebug!.input.press('aim_right'))
  await page.waitForTimeout(DRIVE_OFF_PAD_MS)
  await page.evaluate(() => {
    window.steampunkDebug!.input.release('aim_right')
    window.steampunkDebug!.input.press('aim_down')
  })
}

export function depthTilesOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getHudModel()
    return result.ok ? result.model.depth.depthTiles : 0
  })
}

/** A wide-bore cell still drives its cutters switched on; a stock cell has nothing to hold. */
export async function expectRigFitted(page: Page, cell: GoldenCell): Promise<void> {
  if (cell.rig === 'wide-bore') expect(await engagedGearOf(page)).toContain(WIDE_BORE_GEAR)
}

/** Slots and switches on the widest cutters; the flank key is the player's own way to. */
async function fitWideBore(page: Page): Promise<void> {
  await page.evaluate(
    ([slots, owned]) => {
      const result = window.steampunkDebug!.setVehicleLoadout(slots, owned)
      if (!result.ok) throw new Error(result.problems.join('; '))
      window.steampunkDebug!.input.tap('use_drill_flank')
    },
    [WIDE_BORE_SLOTS, WIDE_BORE_OWNED] as const,
  )
  await expect
    .poll(() => engagedGearOf(page), { message: 'the side cutters switch on' })
    .toContain(WIDE_BORE_GEAR)
}

function engagedGearOf(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.features['drill-gear'].getEngaged() as {
      itemIds?: string[]
    }
    return result.itemIds ?? []
  })
}

export async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} is not on screen`)
  return box
}

export function stageBoxOf(page: Page) {
  return boxOf(page, `[data-testid="${DEVICE_UI_IDS.gameStage}"]`)
}

/** The strip keeps its box and nothing on it runs past it: no reflow, no clipping. */
export async function expectStripHeld(
  page: Page,
  before: { width: number; height: number },
): Promise<void> {
  const now = await boxOf(page, '[data-hud="strip"]')
  expect(Math.abs(now.width - before.width)).toBeLessThanOrEqual(SLACK_PX)
  expect(Math.abs(now.height - before.height)).toBeLessThanOrEqual(SLACK_PX)
  await expectUnclipped(page, '[data-hud="strip"]')
}

/** The hover plate's text once it shows, whole, inside the screen and unclipped. */
export async function readHoverPlate(page: Page, selector: string, cell: GoldenCell) {
  await expect(page.locator(selector)).toBeVisible()
  const box = await boxOf(page, selector)
  expect(box.x).toBeGreaterThanOrEqual(-SLACK_PX)
  expect(box.y).toBeGreaterThanOrEqual(-SLACK_PX)
  expect(box.x + box.width).toBeLessThanOrEqual(cell.viewport.width + SLACK_PX)
  expect(box.y + box.height).toBeLessThanOrEqual(cell.viewport.height + SLACK_PX)
  await expectUnclipped(page, selector)
  return ((await page.locator(selector).textContent()) ?? '').trim()
}

async function expectUnclipped(page: Page, selector: string): Promise<void> {
  const { scroll, client } = await page.locator(selector).evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }))
  expect(scroll, `${selector} runs past its box`).toBeLessThanOrEqual(client)
}

/** The digits a long figure shows from its first non-zero one, its exponent and unit aside. */
export function significantFiguresOf(text: string): number {
  const [mantissa] = text.replace(/\s*m$/, '').replace('-', '').split('e')
  return mantissa.replace(/[,.]/g, '').replace(/^0+/, '').length
}

export async function readSheet(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSheet()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.sheet
  })
}

/**
 * The P40 save's round trip: the session put on P40 with money to match and docked, which writes
 * the autosave; its Export text read; the page reloaded and that text imported as a picked file.
 */
export async function reloadFromP40Save(page: Page, cell: GoldenCell): Promise<string[]> {
  await runDebug(page, [
    ['setPlanet', P40],
    ['giveMoney', '1e40'],
  ])
  await page.evaluate(() => window.steampunkDebug!.teleportToDock('sell'))
  await expect.poll(() => autosavePlanetOf(page), { message: 'the dock autosaves P40' }).toBe(P40)
  const json = await exportedSaveOf(page)
  const errors = await openGoldenGame(page, cell)
  await page.evaluate((text) => {
    const result = window.steampunkDebug!.saves.importText(text)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, json)
  await expect.poll(() => autosavePlanetOf(page), { message: 'the import resumes P40' }).toBe(P40)
  await undock(page)
  return errors
}

async function autosavePlanetOf(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const result = await window.steampunkDebug!.saves.list()
    if (!result.ok) return null
    return result.entries.find((entry) => entry.slot === 'autosave')?.planetIndex ?? null
  })
}

function exportedSaveOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.saves.exportText()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.json
  })
}
