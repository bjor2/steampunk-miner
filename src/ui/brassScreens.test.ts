import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { brassCropFindingsOf, NO_BRASS_CROP_FINDINGS } from '../systems/views/brassCrop'
import { selectArtefactChoiceModel } from '../systems/views/artefactChoiceModel'
import { ArtefactChoiceView } from './artefact/ArtefactChoiceView'
import { TravelCardView } from './travel/TravelTransitionCard'

// Ticket 885 (spec #678): the artefact choice and the travel card on brass, judged on a server
// render with the loaded slices, the descriptions slice's real artefact lines included. The
// browser crop (`e2e/browser/ui/brassScreens.spec.ts`) reads the same marks off the live DOM.

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

function artefactChoiceMarkup(): string {
  const model = selectArtefactChoiceModel(readAuthorityState(), game().playerId)
  return renderToString(createElement(ArtefactChoiceView, { model, focusedId: 'artefact-leave' }))
}

function travelCardMarkup(fromPlanet: number, toPlanet: number): string {
  const transition = { fromPlanet, toPlanet, seconds: 10 }
  return renderToString(createElement(TravelCardView, { transition, onSkip: () => {} }))
}

describe('brass screens (ticket 885)', () => {
  it('draws the artefact choice with no default control and no bare number', () => {
    expect(brassCropFindingsOf(artefactChoiceMarkup())).toEqual(NO_BRASS_CROP_FINDINGS)
  })

  it('draws the artefact choice in the kit sheet frame', () => {
    expect(artefactChoiceMarkup()).toContain('data-frame="sheet"')
  })

  it('shows each artefact stat value as an icon-plus-value fact', () => {
    expect(artefactChoiceMarkup()).toMatch(/data-fact[^>]*>.*?<img/s)
  })

  it('draws the travel card with no default control and no bare number', () => {
    expect(brassCropFindingsOf(travelCardMarkup(1, 2))).toEqual(NO_BRASS_CROP_FINDINGS)
  })

  it('draws the travel card in the kit sheet frame', () => {
    expect(travelCardMarkup(1, 2)).toContain('data-frame="sheet"')
  })

  it('keeps a far planet free of bare numbers too, its lap name in a fact', () => {
    expect(brassCropFindingsOf(travelCardMarkup(71, 72))).toEqual(NO_BRASS_CROP_FINDINGS)
  })
})
