/**
 * Every sheet the UI screenshot suite shoots (spec #678, ticket 689), as data: its shot name, the
 * root its findings are read under, the parts that pan, and how a fresh game reaches it. A sheet
 * the shared sheet component (#686) or a later ticket adds joins as one row. Today's sheets are the
 * ones the upright panel spec (#487) walks: the Sell and Upgrade bays, the settings, the pause menu
 * and its save page, the tech tree's map and list, the planet card and the title menu; and the
 * HUD strip's detail behind the gear button (ticket 684).
 */
import { expect, type Page } from '@playwright/test'
import { TREE_TEST_IDS } from '../../../src/features/tech-tree/ui/nodeTestIds'
import { WORKSHOP_TEST_IDS } from '../../../src/features/workshop/ui/testIds'
import { UI_IDS } from '../../../src/ui/ids'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { dockAt } from '../screens/screenHelpers'
import type { FindingsScope } from './uiShotFindings'

export interface UiSheet extends FindingsScope {
  shot: string
  open(page: Page): Promise<void>
}

const PLATFORM = `[data-testid="${UI_IDS.platformScreen}"]`
const TREE_SCREEN = 'tech-tree-screen'
/** Ticket 211's slice screen id for the tree (`TECH_TREE_SCREEN_ID`). */
const TREE_SCREEN_ID = 'tech-tree.screen'
/** A planet whose card has a line to show on arrival (the magnetic class, ticket 289). */
const PLANET_WITH_CARD = 25
/** Software WebGL on a loaded box opens a screen slowly; a wait, not a judgement. */
const OPEN_TIMEOUT_MS = 30_000

export const UI_SHEETS: readonly UiSheet[] = [
  { shot: 'sell-bay', rootSelector: PLATFORM, pannedTestIds: [], open: openSellBay },
  {
    shot: 'upgrade-bay',
    rootSelector: PLATFORM,
    pannedTestIds: [WORKSHOP_TEST_IDS.carousel],
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
    shot: 'save-page',
    rootSelector: `[data-testid="${UI_IDS.pauseMenu}"] > *`,
    pannedTestIds: [],
    open: openSavePage,
  },
  {
    shot: 'tech-tree',
    rootSelector: `[data-testid="${TREE_SCREEN}"]`,
    pannedTestIds: [TREE_TEST_IDS.map],
    open: openTechTree,
  },
  {
    shot: 'tech-tree-list',
    rootSelector: `[data-testid="${TREE_SCREEN}"]`,
    pannedTestIds: [TREE_TEST_IDS.map],
    open: openTechTreeList,
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

async function openUpgradeBay(page: Page): Promise<void> {
  await giveMoney(page, '1e9')
  await dockAt(page, 'upgrade')
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

async function openSavePage(page: Page): Promise<void> {
  await openPauseMenu(page)
  await page.getByText('Save game', { exact: true }).last().click()
  await expect(page.getByTestId(UI_IDS.pauseMenu)).toHaveAttribute('data-page', 'save')
}

async function openTechTree(page: Page): Promise<void> {
  await giveMoney(page, '1e4')
  await page.evaluate((id) => window.steampunkDebug!.ui.openScreen(id), TREE_SCREEN_ID)
  await expect(page.getByTestId(TREE_SCREEN)).toBeVisible({ timeout: OPEN_TIMEOUT_MS })
}

async function openTechTreeList(page: Page): Promise<void> {
  await openTechTree(page)
  await page.getByTestId(TREE_TEST_IDS.showList).click()
  await expect(page.getByTestId(TREE_TEST_IDS.list)).toBeVisible()
}

async function openPlanetCard(page: Page): Promise<void> {
  await page.evaluate((planet) => window.steampunkDebug!.setPlanet(planet), PLANET_WITH_CARD)
  await expect(page.getByTestId('planet-card')).toBeVisible({ timeout: OPEN_TIMEOUT_MS })
}

/**
 * The shared sheet (ticket 686) on the example slice's probe tabs, the only tabs registered until
 * the shop, tree, cargo and saves move onto it (#687, #688): full over a phone, docked on desktop.
 */
export async function openBaseSheet(page: Page): Promise<void> {
  await undock(page)
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    debug.features.example!.showSheetTabs!()
    const result = debug.ui.openSheet('example.cards')
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
  await expect(page.getByTestId(SHEET_UI_IDS.baseSheet)).toHaveAttribute('data-transition', 'open')
}

/** Ticket 684: the strip's detail, every exact value and word, behind the gear button. */
async function openHudDetail(page: Page): Promise<void> {
  await undock(page)
  await page.getByTestId(UI_IDS.hudGear).click()
  await expect(page.getByTestId(UI_IDS.hudDetail)).toBeVisible()
}

async function openTitleMenu(page: Page): Promise<void> {
  await page.goto('/?debug&title')
  await expect(page.getByTestId('title-menu')).toBeVisible({ timeout: 60_000 })
}

/** Closes the bay the game starts docked at; play resumes once its shutter has shut. */
export async function undock(page: Page): Promise<void> {
  await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
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
