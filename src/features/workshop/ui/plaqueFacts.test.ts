import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../../logging/runLog'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { readUpgradeBayModel } from '../../../store/screenReads'
import { forgetUiTexts, registeredUiTexts } from '../../../systems/views/uiText'
import type { WorkshopRow } from '../../../systems/views/workshopRows'
import { UI_ID_TEMPLATES } from '../../../systems/views/screenIds'
import { resetWorkshopStore } from '../store/workshopStore'
import { plaqueFactsOf } from './plaqueEntry'
import { ShowcaseView } from './ShowcaseScreen'
import { WORKSHOP_TEST_IDS } from './testIds'

// The plaque's fitting fact (ticket 585, TD ruling on #579): a track whose rig look row carries a
// template names the step the player owns; every other plaque keeps its level and price only.

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  resetWorkshopStore()
  forgetUiTexts()
  game().giveMoney('1e9')
  game().teleportToDock('upgrade')
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

function rowOf(upgradeId: string): WorkshopRow {
  return readUpgradeBayModel().tracks.find((row) => row.upgradeId === upgradeId)!
}

function factTextsOf(row: WorkshopRow): string[] {
  return plaqueFactsOf(row, 'icon-money', null).map((fact) => fact.text)
}

function showcaseMarkup(): string {
  const model = readUpgradeBayModel()
  return renderToString(
    createElement(ShowcaseView, { model, focusedId: '', plaqueLayout: 'beside' }),
  )
}

describe('workshop: the plaque’s fitting fact', () => {
  it('keeps every plaque at its level and price below the first look step', () => {
    for (const row of readUpgradeBayModel().tracks) {
      const facts = plaqueFactsOf(row, 'icon-money', null)
      expect(
        facts.map((fact) => fact.testId),
        row.upgradeId,
      ).toEqual([
        UI_ID_TEMPLATES.workshopUpgradeLevel(row.upgradeId),
        UI_ID_TEMPLATES.workshopUpgradeCost(row.upgradeId),
      ])
    }
  })

  it('keeps the plaques without a template unchanged at any owned count', () => {
    for (const id of ['drill_power', 'engine'] as const) {
      for (const level of [5, 100, 1_000]) {
        const row = { ...rowOf(id), level }
        expect(plaqueFactsOf(row, 'icon-money', null)).toEqual(
          plaqueFactsOf(rowOf(id), 'icon-money', null),
        )
      }
    }
  })

  it('adds the owned hull step after the level and the price, leaving both as they were', () => {
    const below = plaqueFactsOf(rowOf('hull'), 'icon-money', null)
    game().setUpgrade('hull', 80)
    const row = rowOf('hull')
    const facts = plaqueFactsOf(row, 'icon-money', null)
    expect(facts.slice(0, 2).map((fact) => fact.testId)).toEqual(below.map((fact) => fact.testId))
    expect(facts[2]).toEqual({
      iconId: row.iconId,
      text: 'Fitting: Banded iron',
      testId: WORKSHOP_TEST_IDS.plaqueFitting('hull'),
    })
  })

  it('grades the top hull step from the first purchase past it', () => {
    const hull = rowOf('hull')
    expect(factTextsOf({ ...hull, level: 440 })[2]).toBe('Fitting: Filigree armour')
    expect(factTextsOf({ ...hull, level: 441 })[2]).toBe('Fitting: Filigree armour · Grade 1')
    expect(factTextsOf({ ...hull, level: 440 + 9_999 })[2]).toBe(
      'Fitting: Filigree armour · Grade 9999',
    )
  })

  it('draws the fitting on the hull plaque and records it tagged visible', () => {
    game().setUpgrade('hull', 20)
    const html = showcaseMarkup()
    expect(html).toContain(`data-testid="${WORKSHOP_TEST_IDS.plaqueFitting('hull')}"`)
    const lines = registeredUiTexts().flatMap((text) => text.lines)
    expect(lines).toContainEqual({ text: 'Fitting: Riveted plate', tag: 'visible' })
  })
})
