import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACTION_MAP, defaultBindings, defaultPadBindings } from '../systems/input/actionMap'
import { DEFAULT_PREFERENCES } from '../systems/input/preferences'
import type { SaveSlotEntry } from '../systems/save/saveSlotIndex'
import { pauseMenuOpenAt, selectPauseMenuModel } from '../systems/views/pauseMenuModel'
import { selectSettingsModel } from '../systems/views/settingsModel'
import { selectTitleMenuModel, type TitleMenu } from '../systems/views/titleMenuModel'
import { forgetUiTexts, registeredUiTexts, type UiTextLine } from '../systems/views/uiText'
import { uiTextProblemsOf } from '../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../systems/views/unregisteredText'
import { PauseMenuView } from './pause/PauseMenuView'
import { SettingsView } from './settings/SettingsView'
import { TitleMenuView } from './title/TitleMenuView'

// Spec #422's text budget on the menus (pass #429) past the start scenario the budget test draws:
// the title's load list, its New Game confirm and a refused load, the pause menu's save page with
// saves and a notice, and settings with a key awaited and a refused rebinding. Every text sits on
// a shared element, and a warning stays visible.

const AUTOSAVE: SaveSlotEntry = {
  slot: 'autosave',
  name: 'Autosave',
  planetIndex: 3,
  playtimeTicks: 42 * 60 * 60,
  savedAtMs: Date.UTC(2026, 9, 14, 18, 7),
  formatVersion: 2,
}

const MANUAL: SaveSlotEntry = {
  slot: 'slot-2',
  name: 'Before the core',
  planetIndex: 5,
  playtimeTicks: 2 * 3600 * 60,
  savedAtMs: Date.UTC(2026, 9, 14, 19, 30),
  formatVersion: 2,
}

const LOAD_PROBLEM = 'the save was written by a newer build'

beforeEach(() => {
  forgetUiTexts()
})

describe('menu text budget (spec #422, pass #429)', () => {
  it('draws the title load list and a refused load on registered elements only', () => {
    const markup = titleMarkupOf({ page: 'load', problems: [LOAD_PROBLEM] })
    expect(markup).toContain('data-ui-text="title.slot.slot-2"')
    expect(markup).toContain('data-ui-text="title.load-refused"')
    expectEveryTextRegisteredWithinBudget(markup)
  })

  it('keeps the New Game warning on the element, never in a tooltip', () => {
    expectEveryTextRegisteredWithinBudget(titleMarkupOf({ page: 'confirmNewGame' }))
    const warnings = everyRecordedLine().filter((line) => line.holds === 'warning')
    expect(warnings.map((line) => line.tag)).toEqual(['visible'])
    expect(warnings[0].text).toContain('named slots stay')
  })

  it('draws the pause save page with saves and a notice on registered elements only', () => {
    const model = selectPauseMenuModel({
      ...pauseMenuOpenAt(1),
      page: 'save',
      slotEntries: [{ ...MANUAL, slot: 'slot-1' }],
      armedSlot: 'slot-1',
      savedSlot: 'slot-2',
    })
    const markup = markupOf(
      createElement(PauseMenuView, {
        model,
        focusedId: model.startFocus,
        onSaveNameChange: () => undefined,
      }),
    )
    expect(markup).toContain('data-ui-text="pause.slot.slot-1"')
    expectEveryTextRegisteredWithinBudget(markup)
  })

  it('draws settings with a key awaited, a refused rebinding and a refused save file on registered elements only', () => {
    const model = selectSettingsModel({
      prefs: DEFAULT_PREFERENCES,
      bindings: defaultBindings(ACTION_MAP),
      inputDevice: 'keyboard',
      padBindings: defaultPadBindings(ACTION_MAP),
      bindingProblems: ['KeyW is already bound to Lift'],
      rebindingActionId: ACTION_MAP.actions[0].id,
      saveTransferProblems: ['save is not JSON'],
    })
    const markup = markupOf(createElement(SettingsView, { model, focusedId: model.close.id }))
    expect(markup).toContain('data-ui-text="settings.rebind-refused"')
    expect(markup).toContain('data-ui-text="settings.save-file-refused"')
    expectEveryTextRegisteredWithinBudget(markup)
  })
})

function titleMarkupOf(titleMenu: Partial<TitleMenu>): string {
  const model = selectTitleMenuModel({
    titleMenu: { page: 'main', slots: [AUTOSAVE, MANUAL], problems: [], ...titleMenu },
    utcOffsetMinutesAt: () => 0,
  })
  return markupOf(createElement(TitleMenuView, { model, focusedId: model.startFocus }))
}

function markupOf(element: ReactElement): string {
  return renderToString(element)
}

function expectEveryTextRegisteredWithinBudget(markup: string): void {
  expect(unregisteredTextsOf(markup)).toEqual([])
  expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
}

function everyRecordedLine(): UiTextLine[] {
  return registeredUiTexts().flatMap((text) => text.lines)
}
