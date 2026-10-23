/**
 * Desktop keys and mouse (spec #678, ticket 768, GD lock 23 Oct) at 1280x800 and 1920x1080, with
 * a 360x640 phone for what a phone must not draw: Tab opens and shuts the base sheet, H and L jump
 * to the Hold and the Ledger and Escape closes what is open; the tool cells and the tabs wear brass
 * key tags on desktop only; once the tray is turned a number key presses that page's cell; a hover
 * shows a tool's plate and never fires it, a click does; and a hover shows the money's full value
 * in the long mode (at most 12 figures, inside the screen) through the 0 to 1e300 sweep, the next
 * upgrade's at levels 1, 99, 9999 and 1e6, and a dial's on P40, with the strip held under it.
 * State and geometry through the DOM and `steampunkDebug` only, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { UPGRADE_IDS } from '../../../src/systems/economy/economyDefinition'
import { UI_ID_TEMPLATES, UI_IDS } from '../../../src/ui/ids'
import { openGame, SLACK_PX, type HudLayoutCell } from '../hud/hudLayoutHelpers'
import { undock } from './uiShotSheets'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 240_000
/** The long mode's most significant figures (`numbers.longSignificantFigures`). */
const LONG_FIGURES_MAX = 12
/** The chips' widest figure (#681), which a hover never widens. */
const FIGURE_CHARS_MAX = 6
const MONEY_STEPS = Array.from({ length: 21 }, (_, at) => `1e${at * 15}`)
const LEVELS = [1, 99, 9999, 1_000_000]
const P40 = 40
const TOOL_BAR = 'hud-tool-slots'
const OVERFLOW = 'hud-tool-overflow'
const SLOT_ONE = 'power-up-slot-powerup.1'
/** Two slotted power-ups, the guns, a charge rack and the bore gun: Plant charge waits in the tray. */
const SLOTS = { 'powerup.1': 'power.steam_shield', 'powerup.2': 'power.grav_anchor' }

interface InputCell extends HudLayoutCell {
  layout: 'phone' | 'desktop'
}

const CELLS: readonly InputCell[] = [
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
].map(({ name, width, height }) => ({
  name,
  viewport: { width, height },
  isTouch: false,
  isTvMode: false,
  floor: null,
  layout: 'desktop' as const,
}))

const PHONE: InputCell = {
  name: 'phone-360x640',
  viewport: { width: 360, height: 640 },
  isTouch: true,
  isTvMode: false,
  floor: null,
  layout: 'phone',
}

for (const cell of CELLS) {
  test.describe(`desktop keys and mouse (ticket 768): ${cell.name}`, () => {
    test.use({ viewport: cell.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

    test('opens and shuts the sheet with Tab, jumps with H and L, and closes with Escape', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await page.keyboard.press('Tab')
      await expect.poll(() => openTabIdOf(page)).not.toBeNull()
      await page.keyboard.press('Tab')
      await expect.poll(() => openTabIdOf(page)).toBeNull()
      await page.keyboard.press('KeyH')
      await expect.poll(() => openTabIdOf(page)).toBe('hold')
      await expect(page.locator('[data-sheet-tab="hold"] [data-key-tag="H"]')).toBeVisible()
      await page.keyboard.press('KeyL')
      await expect.poll(() => openTabIdOf(page)).toBe('ledger')
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await expect.poll(() => openTabIdOf(page)).toBeNull()
      expect(errors).toEqual([])
    })

    test('tags each tool cell with its key and presses a turned page’s cell with its number key', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await stackTools(page)
      const bar = page.getByTestId(TOOL_BAR)
      await expect(bar.locator('[data-key-tag="1"]')).toBeVisible()
      await expect(bar.locator('[data-key-tag="8"]')).toBeVisible()
      await page.getByTestId(OVERFLOW).click()
      await expect(page.getByTestId('touch-plant_charge')).toBeVisible()
      const before = await pressedActions(page)
      await page.keyboard.press('Digit1')
      await expect
        .poll(async () => (await pressedActions(page)).slice(before.length))
        .toEqual(['plant_charge'])
      expect(errors).toEqual([])
    })

    test('shows a tool’s hover plate without firing it, and fires it on a click', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await stackTools(page)
      const before = await pressedActions(page)
      await page.getByTestId(SLOT_ONE).hover()
      await expect(page.locator('[data-hover-plate]')).toHaveCount(1)
      await expect(page.locator('[data-hover-plate]')).toBeVisible()
      await expectInsideViewport(page, '[data-hover-plate]', cell)
      expect((await pressedActions(page)).slice(before.length)).toEqual([])
      await page.getByTestId(SLOT_ONE).click()
      await expect
        .poll(async () => (await pressedActions(page)).slice(before.length))
        .toContain('use_slot_1')
      expect(errors).toEqual([])
    })

    test('shows the money in full on hover through the 0 to 1e300 sweep, the strip held', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      const money = page.getByTestId(UI_IDS.hudStripMoney)
      const strip = await boxOf(page, '[data-hud="strip"]')
      for (const amount of MONEY_STEPS) {
        await runDebug(page, [['giveMoney', amount]])
        await money.hover()
        const long = await plateText(page, '[data-hover-plate="strip:money"]')
        expect(significantFiguresOf(long), `${amount} as ${long}`).toBeLessThanOrEqual(
          LONG_FIGURES_MAX,
        )
        expect(((await money.textContent()) ?? '').length).toBeLessThanOrEqual(FIGURE_CHARS_MAX)
        await expectInsideViewport(page, '[data-hover-plate="strip:money"]', cell)
        await expectStripHeld(page, strip)
      }
      expect(errors).toEqual([])
    })

    for (const level of LEVELS) {
      test(`shows the next upgrade’s price in full on hover with every track at level ${level}`, async ({
        page,
      }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        const errors = await openPlainGame(page, cell)
        await undock(page)
        await runDebug(page, [
          ...UPGRADE_IDS.map((id) => ['setUpgrade', id, level] as const),
          ['giveMoney', '1e300'],
        ])
        const chip = page.getByTestId(UI_IDS.hudNextUpgrade)
        await expect(chip).toBeVisible()
        await chip.hover()
        const long = await plateText(page, '[data-hover-plate="strip:next-upgrade"]')
        expect(significantFiguresOf(long), long).toBeLessThanOrEqual(LONG_FIGURES_MAX)
        await expectInsideViewport(page, '[data-hover-plate="strip:next-upgrade"]', cell)
        expect(errors).toEqual([])
      })
    }

    test('shows a dial’s full value on hover on P40', async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openPlainGame(page, cell)
      await undock(page)
      await runDebug(page, [
        ['setPlanet', P40],
        ['giveMoney', '1e40'],
      ])
      await page.getByTestId(UI_ID_TEMPLATES.hudDial('hull')).hover()
      const long = await plateText(page, '[data-hover-plate="dial:hull"]')
      expect(significantFiguresOf(long), long).toBeLessThanOrEqual(LONG_FIGURES_MAX)
      await expectInsideViewport(page, '[data-hover-plate="dial:hull"]', cell)
      expect(errors).toEqual([])
    })
  })
}

test.describe(`desktop keys and mouse (ticket 768): ${PHONE.name}`, () => {
  test.use({ viewport: PHONE.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })

  test('draws no key tag and no hover plate on a phone, tools and sheet shown', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openPlainGame(page, PHONE)
    await page.touchscreen.tap(PHONE.viewport.width / 2, PHONE.viewport.height * 0.2)
    await stackTools(page)
    await expect(page.locator('[data-key-tag]')).toHaveCount(0)
    await page.evaluate(() => window.steampunkDebug!.ui.openSheet('hold'))
    await expect.poll(() => openTabIdOf(page)).toBe('hold')
    await expect(page.locator('[data-key-tag]')).toHaveCount(0)
    await expect(page.locator('[data-hover-plate]')).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

/** The debug build with the opening transmission taken down by an unbound key. */
async function openPlainGame(page: Page, cell: InputCell): Promise<string[]> {
  const errors = await openGame(page, cell)
  await page.keyboard.press('KeyK')
  return errors
}

async function stackTools(page: Page): Promise<void> {
  const problems = await page.evaluate((slots) => {
    const debug = window.steampunkDebug!
    return [
      debug.setGunLevel(10),
      debug.setCharges(2, 1),
      debug.setVehicleLoadout(slots, []),
      debug.features['ground-gun'].setLevels(1, 1, 1),
    ].flatMap((result) => (result.ok ? [] : result.problems))
  }, SLOTS)
  expect(problems).toEqual([])
  await expect(page.getByTestId(TOOL_BAR)).toBeVisible()
}

function openTabIdOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSheet()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.sheet.openTabId
  })
}

/** The actions keys, clicks and taps pressed, oldest first, each once on its way down. */
function pressedActions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.input.getActionStream()
    if (!result.ok) throw new Error('getActionStream failed')
    return result.stream.filter((edge) => edge.isDown).map((edge) => edge.actionId)
  })
}

type DebugCall =
  | readonly ['giveMoney', string]
  | readonly ['setPlanet', number]
  | readonly ['setUpgrade', string, number]

async function runDebug(page: Page, calls: readonly DebugCall[]): Promise<void> {
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

async function plateText(page: Page, selector: string): Promise<string> {
  await expect(page.locator(selector)).toBeVisible()
  return ((await page.locator(selector).textContent()) ?? '').trim()
}

/** The digits a long figure shows from its first non-zero one, its exponent and unit aside. */
function significantFiguresOf(text: string): number {
  const [mantissa] = text.replace(/\s*m$/, '').replace('-', '').split('e')
  return mantissa.replace(/[,.]/g, '').replace(/^0+/, '').length
}

/** A plate floats over the view, and none of it leaves the screen: no clipped figure. */
async function expectInsideViewport(page: Page, selector: string, cell: InputCell): Promise<void> {
  const box = await boxOf(page, selector)
  expect(box.x).toBeGreaterThanOrEqual(-SLACK_PX)
  expect(box.y).toBeGreaterThanOrEqual(-SLACK_PX)
  expect(box.x + box.width).toBeLessThanOrEqual(cell.viewport.width + SLACK_PX)
  expect(box.y + box.height).toBeLessThanOrEqual(cell.viewport.height + SLACK_PX)
  const { scroll, client } = await page.locator(selector).evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }))
  expect(scroll).toBeLessThanOrEqual(client)
}

/** The strip keeps its box under a hover: a plate floats, it never reflows the strip. */
async function expectStripHeld(
  page: Page,
  before: { width: number; height: number },
): Promise<void> {
  const now = await boxOf(page, '[data-hud="strip"]')
  expect(Math.abs(now.width - before.width)).toBeLessThanOrEqual(SLACK_PX)
  expect(Math.abs(now.height - before.height)).toBeLessThanOrEqual(SLACK_PX)
}

function boxOf(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect)
}
