/**
 * Every sheet the UI screenshot suite shoots (spec #678, ticket 689), as data: its shot name, the
 * root its findings are read under, the parts that pan, and how a fresh game reaches it. A sheet
 * the shared sheet component (#686) or a later ticket adds joins as one row. Today's sheets are the
 * ones the upright panel spec (#487) walks: the Sell bay, the Upgrade bay's Outfitter on the base
 * sheet (#687), the settings, the pause menu, the tech tree's Patent Office on the base sheet
 * (#687), the planet card and the title menu; the HUD strip's detail behind the gear button
 * (ticket 684); and the base sheet's Hold and Ledger (ticket 688: the Sell bay's ore and the pause
 * menu's save page as were), and the sale receipt over the Sell bay after a wide P41+ haul, its lines
 * scrolling past eight (ticket 717), and the unlock reveal's plate over the Upgrade bay after the
 * guns are mounted from the Outfitter, held so the shot finds it (ticket 718).
 */
import { expect, type Page } from '@playwright/test'
import { TREE_TEST_IDS } from '../../../src/features/tech-tree/ui/nodeTestIds'
import { UI_IDS } from '../../../src/ui/ids'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { dockAt } from '../screens/screenHelpers'
import { RECEIPT_ROWS_TEST_ID, RECEIPT_TEST_ID, sellWideHaul } from '../sellReceiptSales'
import { REVEAL_PLATE_TEST_ID, revealTurretMount } from '../unlockRevealBuys'
import type { FindingsScope } from './uiShotFindings'

export interface UiSheet extends FindingsScope {
  shot: string
  open(page: Page): Promise<void>
}

const PLATFORM = `[data-testid="${UI_IDS.platformScreen}"]`
/** The tech tree's tab on the base sheet (`PATENT_OFFICE_TAB_ID`, ticket 687). */
const PATENT_OFFICE_TAB_ID = 'tech-tree.patent-office'
/** A planet whose card has a line to show on arrival (the magnetic class, ticket 289). */
const PLANET_WITH_CARD = 25
/** Software WebGL on a loaded box opens a screen slowly; a wait, not a judgement. */
const OPEN_TIMEOUT_MS = 30_000

export const UI_SHEETS: readonly UiSheet[] = [
  { shot: 'sell-bay', rootSelector: PLATFORM, pannedTestIds: [], open: openSellBay },
  {
    shot: 'upgrade-bay',
    rootSelector: `[data-testid="${SHEET_UI_IDS.baseSheet}"]`,
    pannedTestIds: [],
    open: openUpgradeBay,
  },
  {
    shot: 'settings',
    rootSelector: `[data-testid="${UI_IDS.settingsPanel}"] > *`,
    pannedTestIds: [],
    open: openSettings,
  },
  {
    shot: 'pause-menu',
    rootSelector: `[data-testid="${UI_IDS.pauseMenu}"] > *`,
    pannedTestIds: [],
    open: openPauseMenu,
  },
  {
    shot: 'hold',
    rootSelector: `[data-testid="${SHEET_UI_IDS.baseSheet}"]`,
    pannedTestIds: [],
    open: openHold,
  },
  {
    shot: 'ledger',
    rootSelector: `[data-testid="${SHEET_UI_IDS.baseSheet}"]`,
    pannedTestIds: [],
    open: openLedger,
  },
  {
    shot: 'patent-office',
    rootSelector: `[data-testid="${SHEET_UI_IDS.baseSheet}"]`,
    pannedTestIds: [],
    open: openPatentOffice,
  },
  {
    shot: 'planet-card',
    rootSelector: '[data-testid="planet-card"]',
    pannedTestIds: [],
    open: openPlanetCard,
  },
  {
    shot: 'base-sheet',
    rootSelector: `[data-testid="${SHEET_UI_IDS.baseSheet}"]`,
    pannedTestIds: [],
    open: openBaseSheet,
  },
  {
    shot: 'hud-detail',
    rootSelector: `[data-testid="${UI_IDS.hudDetail}"]`,
    pannedTestIds: [],
    open: openHudDetail,
  },
  {
    shot: 'sell-receipt',
    rootSelector: `[data-testid="${RECEIPT_TEST_ID}"]`,
    pannedTestIds: [],
    open: openSellReceipt,
  },
  {
    shot: 'unlock-reveal',
    rootSelector: `[data-testid="${REVEAL_PLATE_TEST_ID}"]`,
    pannedTestIds: [],
    open: revealTurretMount,
  },
  {
    shot: 'title-menu',
    rootSelector: '[data-testid="title-menu"] section',
    pannedTestIds: [],
    open: openTitleMenu,
  },
]

async function openSellBay(page: Page): Promise<void> {
  await giveMoney(page, '1e9')
  await dockAt(page, 'sell')
}

/** Docking at the Upgrade bay opens the base sheet on the Outfitter (ticket 687). */
async function openUpgradeBay(page: Page): Promise<void> {
  await giveMoney(page, '1e9')
  await dockAt(page, 'upgrade')
  await expect(page.getByTestId(SHEET_UI_IDS.outfitterCards)).toBeVisible({
    timeout: OPEN_TIMEOUT_MS,
  })
}

async function openSettings(page: Page): Promise<void> {
  await dockAt(page, 'sell')
  await page.getByTestId('platform-settings').click()
  await expect(page.getByTestId(UI_IDS.settingsPanel)).toBeVisible()
}

async function openPauseMenu(page: Page): Promise<void> {
  await undock(page)
  await page.evaluate(() => window.steampunkDebug!.input.tap('open_pause_menu'))
  await expect(page.getByTestId(UI_IDS.pauseMenu)).toBeVisible()
}

/** The Hold (ticket 688), from the Sell bay's Hold row: its Sell cards act there. */
export async function openHold(page: Page): Promise<void> {
  await dockAt(page, 'sell')
  await page.getByTestId(UI_IDS.sellbayHold).click()
  await expectSheetOpen(page)
}

/** The Ledger (ticket 688): the pause menu's Save game opens it on the sheet. */
export async function openLedger(page: Page): Promise<void> {
  await openPauseMenu(page)
  await page.getByText('Save game', { exact: true }).last().click()
  await expect(page.getByTestId(UI_IDS.ledger)).toBeVisible()
  await expectSheetOpen(page)
}

async function expectSheetOpen(page: Page): Promise<void> {
  await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveAttribute('data-transition', 'open')
}

/** The tech tree is the Patent Office on the base sheet (ticket 687), opened as its HUD button does. */
async function openPatentOffice(page: Page): Promise<void> {
  await giveMoney(page, '1e4')
  await undock(page)
  await page.evaluate((id) => {
    const result = window.steampunkDebug!.ui.openSheet(id)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, PATENT_OFFICE_TAB_ID)
  await expect(page.getByTestId(TREE_TEST_IDS.patentCards)).toBeVisible({
    timeout: OPEN_TIMEOUT_MS,
  })
}

async function openPlanetCard(page: Page): Promise<void> {
  await page.evaluate((planet) => window.steampunkDebug!.setPlanet(planet), PLANET_WITH_CARD)
  await expect(page.getByTestId('planet-card')).toBeVisible({ timeout: OPEN_TIMEOUT_MS })
}

/**
 * The shared sheet (ticket 686) on the example slice's probe tabs, a long card list that scrolls
 * on a phone: full over a phone, docked on desktop.
 */
export async function openBaseSheet(page: Page): Promise<void> {
  await undock(page)
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    debug.features.example!.showSheetTabs!()
    const result = debug.ui.openSheet('example.cards')
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
  await expectSheetOpen(page)
}

/** Ticket 684: the strip's detail, every exact value and word, behind the gear button. */
async function openHudDetail(page: Page): Promise<void> {
  await undock(page)
  await page.getByTestId(UI_IDS.hudGear).click()
  await expect(page.getByTestId(UI_IDS.hudDetail)).toBeVisible()
}

/**
 * Ticket 717: the receipt of a sale of eight P41+ tiers, shot once its total has rolled (a tap on
 * a rolled receipt would put it away). Its lines scroll inside the receipt, which is the shared
 * scroll area's job, so nothing in it is panned.
 */
async function openSellReceipt(page: Page): Promise<void> {
  await sellWideHaul(page)
  await expect(page.getByTestId(RECEIPT_TEST_ID)).not.toHaveAttribute('data-rolling', {
    timeout: OPEN_TIMEOUT_MS,
  })
  await expect(page.getByTestId(RECEIPT_ROWS_TEST_ID)).toBeVisible()
}

async function openTitleMenu(page: Page): Promise<void> {
  await page.goto('/?debug&title')
  await expect(page.getByTestId('title-menu')).toBeVisible({ timeout: 60_000 })
}

/**
 * Closes the bay the game starts docked at; play resumes once its shutter has shut. A sheet the
 * bay opened (the Outfitter, ticket 687) takes Escape first, so it is shut before.
 */
export async function undock(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.steampunkDebug!.ui.closeSheet()
    window.steampunkDebug!.input.tap('ui_cancel')
  })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const result = window.steampunkDebug!.ui.getBayPresentation()
        return result.ok ? result.presentation.shutter.phase : 'closed'
      }),
    )
    .toBe('closed')
}

async function giveMoney(page: Page, amount: string): Promise<void> {
  await page.evaluate((money) => {
    const result = window.steampunkDebug!.giveMoney(money)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, amount)
}
