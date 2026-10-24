/**
 * The full desktop golden suite (spec #678, ticket 772, GD lock 23 Oct 19:51), beside the 360 px
 * phone goldens of the UI screenshot suite: at 1280x800, 1920x1080 and 2560x1440, and at 1280x800
 * with the widest bore the build ships (#662), the strip holds its box with no figure past the
 * #681 formatter's 6 characters, and the #768 long-mode hover plate shows the whole value inside
 * the screen, through the 0 to 1e300 money sweep, every track at levels 1, 99, 9999 and 1e6 (the
 * Outfitter docked and clean), and a P40 save exported, reloaded and imported; the docked sheet
 * covers at most a quarter of the play area and the HUD stays within its budget while drilling.
 * The phone cell holds what the desktop work must not touch: no dock, no key tag, no plate.
 * Every judgement is geometry or state through the DOM and `steampunkDebug`, never pixels.
 */
import { expect, test } from '@playwright/test'
import { UPGRADE_IDS } from '../../../src/systems/economy/economyDefinition'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { UI_ID_TEMPLATES, UI_IDS } from '../../../src/ui/ids'
import { SLACK_PX } from '../hud/hudLayoutHelpers'
import {
  boxOf,
  depthTilesOf,
  digDown,
  DESKTOP_GOLDEN_CELLS,
  DOCK_SHARE_MAX,
  expectRigFitted,
  expectStripHeld,
  FIGURE_CHARS_MAX,
  LEVELS,
  LONG_FIGURES_MAX,
  MONEY_STEPS,
  openGoldenGame,
  PHONE_GOLDEN_CELL,
  readHoverPlate,
  readSheet,
  reloadFromP40Save,
  runDebug,
  significantFiguresOf,
  stageBoxOf,
} from './desktopGoldenSteps'
import {
  hudFindingsOf,
  NO_HUD_FINDINGS,
  NO_SHEET_FINDINGS,
  sheetFindingsOf,
} from './uiShotFindings'
import { openBaseSheet, openUpgradeBay, UI_SHEETS } from './uiShotSheets'

/** Software WebGL on a loaded box is slow; this is a wait, not a judgement. */
const TEST_TIMEOUT_MS = 300_000
/** Two tiles down is drilling, as the compact HUD spec (#500) counts it. */
const DRILLED_TILES = 2
const DRILL_TIMEOUT_MS = 60_000
const STRIP = '[data-hud="strip"]'
const MONEY_PLATE = '[data-hover-plate="strip:money"]'
const NEXT_UPGRADE_PLATE = '[data-hover-plate="strip:next-upgrade"]'
const HULL_PLATE = '[data-hover-plate="dial:hull"]'
const OUTFITTER = UI_SHEETS.find((row) => row.shot === 'upgrade-bay')!
const PAUSE_MENU = UI_SHEETS.find((row) => row.shot === 'pause-menu')!
const BASE_SHEET = UI_SHEETS.find((row) => row.shot === 'base-sheet')!

for (const cell of DESKTOP_GOLDEN_CELLS) {
  test.describe(`desktop goldens (ticket 772): ${cell.name}`, () => {
    test.use({ viewport: cell.viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

    test('holds the strip and shows each figure whole on hover through the 0 to 1e300 sweep', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGoldenGame(page, cell)
      const money = page.getByTestId(UI_IDS.hudStripMoney)
      const strip = await boxOf(page, STRIP)
      for (const amount of MONEY_STEPS) {
        await runDebug(page, [['giveMoney', amount]])
        await expectStripHeld(page, strip)
        expect(((await money.textContent()) ?? '').length, amount).toBeLessThanOrEqual(
          FIGURE_CHARS_MAX,
        )
        await money.hover()
        const long = await readHoverPlate(page, MONEY_PLATE, cell)
        expect(significantFiguresOf(long), `${amount} as ${long}`).toBeLessThanOrEqual(
          LONG_FIGURES_MAX,
        )
        await expectStripHeld(page, strip)
      }
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(errors).toEqual([])
    })

    for (const level of LEVELS) {
      test(`holds the strip, the price hover and the docked Outfitter at level ${level}`, async ({
        page,
      }) => {
        test.setTimeout(TEST_TIMEOUT_MS)
        const errors = await openGoldenGame(page, cell)
        const strip = await boxOf(page, STRIP)
        await runDebug(page, [
          ...UPGRADE_IDS.map((id) => ['setUpgrade', id, level] as const),
          ['giveMoney', '1e300'],
        ])
        await expectStripHeld(page, strip)
        const chip = page.getByTestId(UI_IDS.hudNextUpgrade)
        await expect(chip).toBeVisible()
        await chip.hover()
        const long = await readHoverPlate(page, NEXT_UPGRADE_PLATE, cell)
        expect(significantFiguresOf(long), long).toBeLessThanOrEqual(LONG_FIGURES_MAX)
        await expectStripHeld(page, strip)
        await openUpgradeBay(page)
        await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveAttribute(
          'data-placement',
          'docked',
        )
        expect(await sheetFindingsOf(page, OUTFITTER)).toEqual(NO_SHEET_FINDINGS)
        expect(errors).toEqual([])
      })
    }

    test('resumes a P40 save with the strip, a dial hover and the pause menu clean', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const before = await openGoldenGame(page, cell)
      const errors = await reloadFromP40Save(page, cell)
      const money = (await page.getByTestId(UI_IDS.hudStripMoney).textContent()) ?? ''
      expect(money.length, money).toBeLessThanOrEqual(FIGURE_CHARS_MAX)
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      await page.getByTestId(UI_ID_TEMPLATES.hudDial('hull')).hover()
      const long = await readHoverPlate(page, HULL_PLATE, cell)
      expect(significantFiguresOf(long), long).toBeLessThanOrEqual(LONG_FIGURES_MAX)
      await PAUSE_MENU.open(page)
      expect(await sheetFindingsOf(page, PAUSE_MENU)).toEqual(NO_SHEET_FINDINGS)
      expect([...before, ...errors]).toEqual([])
    })

    test('covers at most a quarter of the play area with the dock, the HUD in budget, drilling', async ({
      page,
    }) => {
      test.setTimeout(TEST_TIMEOUT_MS)
      const errors = await openGoldenGame(page, cell)
      await digDown(page)
      await expect
        .poll(() => depthTilesOf(page), {
          message: 'the rig drills down',
          timeout: DRILL_TIMEOUT_MS,
        })
        .toBeGreaterThanOrEqual(DRILLED_TILES)
      await expectRigFitted(page, cell)
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      const wide = await stageBoxOf(page)
      await openBaseSheet(page)
      const sheet = await readSheet(page)
      expect(sheet.placement).toBe('docked')
      expect(sheet.dockWidthPx!).toBeLessThanOrEqual(wide.width * DOCK_SHARE_MAX)
      const narrow = await stageBoxOf(page)
      expect(Math.abs(wide.width - narrow.width - sheet.dockWidthPx!)).toBeLessThanOrEqual(SLACK_PX)
      expect(await sheetFindingsOf(page, BASE_SHEET)).toEqual(NO_SHEET_FINDINGS)
      expect(await hudFindingsOf(page)).toEqual(NO_HUD_FINDINGS)
      expect(errors).toEqual([])
    })
  })
}

test.describe(`desktop goldens (ticket 772): ${PHONE_GOLDEN_CELL.name}`, () => {
  const cell = PHONE_GOLDEN_CELL
  test.use({ viewport: cell.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })

  test('keeps the phone undocked, untagged and unhovered, its strip held through the sweep', async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS)
    const errors = await openGoldenGame(page, cell)
    const money = page.getByTestId(UI_IDS.hudStripMoney)
    const strip = await boxOf(page, STRIP)
    for (const amount of MONEY_STEPS) {
      await runDebug(page, [['giveMoney', amount]])
      await expectStripHeld(page, strip)
      expect(((await money.textContent()) ?? '').length, amount).toBeLessThanOrEqual(
        FIGURE_CHARS_MAX,
      )
    }
    await expect(page.locator('[data-key-tag]')).toHaveCount(0)
    await expect(page.locator('[data-hover-plate]')).toHaveCount(0)
    await openBaseSheet(page)
    expect((await readSheet(page)).placement).toBe('full')
    expect(errors).toEqual([])
  })
})
