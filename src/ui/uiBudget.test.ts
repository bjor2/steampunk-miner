import { readdirSync, readFileSync } from 'node:fs'
import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UI_BUDGET_ALLOWLIST, UI_BUDGET_PANELS } from '../constants/uiBudgetAllowlist'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { installSaveFolder } from '../store/checkpoint'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { createMemorySaveFolder } from '../store/memorySaveFolder'
import {
  readPauseMenuModel,
  readSettingsModel,
  readShownSheetTabIds,
  readTitleMenuModel,
} from '../store/screenReads'
import { focusOnScreen } from '../systems/views/menuFocus'
import { SETTINGS_START_FOCUS } from '../systems/views/settingsModel'
import { ratchetProblemsOf } from '../systems/views/uiBudgetRatchet'
import { readUiBudget, type UiBudgetReading } from '../systems/views/uiBudgetReading'
import { scrollFindingsOf, type SourceText } from '../systems/views/uiScrollGuard'
import { forgetUiTexts, registeredUiTexts, type UiText } from '../systems/views/uiText'
import { titleOnlyTextsOf } from '../systems/views/titleOnlyText'
import { unregisteredTextsOf } from '../systems/views/unregisteredText'
import { Hud } from './hud/Hud'
import { PauseMenuView } from './pause/PauseMenuView'
import { PlatformScreen } from './platform/PlatformScreen'
import { sheetTabById } from './registries/sheetTabs'
import { SettingsView } from './settings/SettingsView'
import { TitleMenuView } from './title/TitleMenuView'

// The UI budget of spec #422, the TD's ruling on #424: each of the five panels is rendered on the
// server from the start scenario, the smallest store that draws it, and every element it draws is
// judged against the limits in constants/uiParts.ts. Text outside the shared Title+OneLine element
// is an unregistered element; a scroll container outside the shared scroll area's sheet is a
// second one. A panel over budget needs its exact allowlist entry (constants/uiBudgetAllowlist.ts)
// until its pass trims it. Fixtures draw only what the start scenario holds, so a held or locked
// feature never previews here. `UI_BUDGET_REPORT=1` prints the measured counts and writes nothing.
// A server render sees a zustand hook's initial state, so a panel opened by a store flag is drawn
// through its View with the store's read model, as the panels' own specs do.

const IS_REPORT_ASKED = process.env.UI_BUDGET_REPORT === '1'
const SRC_DIR = new URL('../', import.meta.url)

interface PanelFixture {
  readonly panel: string
  /** Sets the start scenario up through store actions and returns the panel's markup. */
  readonly draw: () => Promise<string>
}

const game = () => useGameStore.getState()
const markupOf = (component: ComponentType) => renderToString(createElement(component))

function openedModelOf<T>(model: T | null, panel: string): T {
  if (model === null) throw new Error(`the ${panel} did not open`)
  return model
}

async function dockedBayMarkup(bay: 'upgrade' | 'sell'): Promise<string> {
  game().teleportToDock(bay)
  return markupOf(PlatformScreen)
}

/**
 * The content of the sheet tab whose id starts with `prefix` (ticket 687: the Upgrade bay's
 * Outfitter and the tech tree's Patent Office are tabs, found by the panel's id prefix, as a slice
 * registers them). The sheet's own frame is the kit's (#686), drawn the same round every tab.
 */
function sheetTabMarkup(prefix: string): string {
  const tab = readShownSheetTabIds()
    .map(sheetTabById)
    .find((entry) => entry?.id.startsWith(prefix))
  if (tab === undefined || tab === null) throw new Error(`no sheet tab starts with ${prefix}`)
  game().openSheet(tab.id)
  return markupOf(tab.Panel)
}

/** The Upgrade bay's frame over the car, then its Outfitter on the base sheet (ticket 687). */
async function upgradeBayMarkup(): Promise<string> {
  return [await dockedBayMarkup('upgrade'), sheetTabMarkup('workshop.')].join('')
}

/** The tree is the Patent Office, a tab on the base sheet (ticket 687). */
async function techTreeMarkup(): Promise<string> {
  return sheetTabMarkup('tech-tree.')
}

async function hudMarkup(): Promise<string> {
  return markupOf(Hud)
}

async function titleMenuMarkup(): Promise<string> {
  await game().openTitleMenu()
  const model = openedModelOf(readTitleMenuModel(), 'title menu')
  const focusedId = focusOnScreen(model.focusStops, null, model.startFocus)
  return renderToString(createElement(TitleMenuView, { model, focusedId }))
}

function pauseMenuMarkup(): string {
  game().openPauseMenu()
  const model = openedModelOf(readPauseMenuModel(), 'pause menu')
  const focusedId = focusOnScreen(model.focusStops, null, model.startFocus)
  return renderToString(createElement(PauseMenuView, { model, focusedId }))
}

function settingsMarkup(): string {
  game().openSettings()
  const model = readSettingsModel()
  return renderToString(createElement(SettingsView, { model, focusedId: SETTINGS_START_FOCUS }))
}

/** Title, pause and settings, each from a fresh start: the panels the rest of the game opens. */
async function otherPanelsMarkup(): Promise<string> {
  const title = await titleMenuMarkup()
  resetGameStore()
  const pause = pauseMenuMarkup()
  resetGameStore()
  return [title, pause, settingsMarkup()].join('')
}

const FIXTURES: readonly PanelFixture[] = [
  { panel: 'upgrade-bay', draw: upgradeBayMarkup },
  { panel: 'tech-tree', draw: techTreeMarkup },
  { panel: 'dock', draw: () => dockedBayMarkup('sell') },
  { panel: 'hud', draw: hudMarkup },
  { panel: 'other-panels', draw: otherPanelsMarkup },
]

interface FixtureDrawing {
  readonly panel: string
  readonly markup: string
  readonly texts: readonly UiText[]
}

async function drawFixture(fixture: PanelFixture): Promise<FixtureDrawing> {
  resetGameStore()
  forgetUiTexts()
  const markup = await fixture.draw()
  return { panel: fixture.panel, markup, texts: registeredUiTexts() }
}

async function drawEveryFixture(): Promise<FixtureDrawing[]> {
  const drawings: FixtureDrawing[] = []
  for (const fixture of FIXTURES) drawings.push(await drawFixture(fixture))
  return drawings
}

/** Every non-test sheet and component under src, by repo path. */
function readStyleAndViewSources(): SourceText[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(css|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => ({ path: `src/${path}`, text: readFileSync(new URL(path, SRC_DIR), 'utf8') }))
}

/** One text per id across the fixtures, the newest drawing winning as in the registry. */
function textsByIdOf(drawings: readonly FixtureDrawing[]): UiText[] {
  const byId = new Map(drawings.flatMap((drawing) => drawing.texts.map((text) => [text.id, text])))
  return [...byId.values()]
}

function readTreeBudget(drawings: readonly FixtureDrawing[]): UiBudgetReading {
  return readUiBudget({
    panels: UI_BUDGET_PANELS,
    fixtures: drawings.map((drawing) => ({
      panel: drawing.panel,
      unregistered: unregisteredTextsOf(drawing.markup),
    })),
    texts: textsByIdOf(drawings),
    scrollFindings: scrollFindingsOf(readStyleAndViewSources()),
  })
}

/** The measured counts as allowlist entries, for seeding or lowering the allowlist by hand. */
function printReport(reading: UiBudgetReading): void {
  const counts = reading.measures.map((measure) => ({
    panel: measure.panel,
    counts: Object.fromEntries(Object.entries(measure.counts).filter(([, count]) => count > 0)),
  }))
  console.log(JSON.stringify({ counts, breaches: reading.breaches }, null, 2))
}

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  installSaveFolder({ folder: createMemorySaveFolder().folder, readWallClockMs: () => 0 })
})

afterEach(() => {
  installSaveFolder(null)
  uninstallRunLog()
  forgetUiTexts()
})

describe('ui budget', () => {
  it('draws every panel from the start scenario, each with something on it', async () => {
    const drawings = await drawEveryFixture()
    expect(drawings.map((drawing) => drawing.panel)).toEqual(
      UI_BUDGET_PANELS.map((panel) => panel.id),
    )
    for (const drawing of drawings) expect(drawing.markup, drawing.panel).not.toBe('')
  })

  // Ticket 476: a phone never shows a hover title, so none may hold words no drawn line repeats.
  it('carries nothing in a hover title alone on any panel', async () => {
    const drawings = await drawEveryFixture()
    const found = drawings.map((drawing) => ({
      panel: drawing.panel,
      titleOnly: titleOnlyTextsOf(drawing.markup),
    }))
    expect(found.filter((panel) => panel.titleOnly.length > 0)).toEqual([])
  })

  it('keeps every panel within budget or exactly at its allowlist entry', async () => {
    const reading = readTreeBudget(await drawEveryFixture())
    if (IS_REPORT_ASKED) printReport(reading)
    const problems = [
      ...reading.hardProblems,
      ...ratchetProblemsOf(reading.measures, UI_BUDGET_ALLOWLIST, UI_BUDGET_PANELS),
    ]
    expect(problems).toEqual([])
  })
})
