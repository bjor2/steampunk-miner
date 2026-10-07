import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../logging/runLog'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { resetGameStore } from '../../store/gameStore'
import { readSliceBayScreenIdAt } from '../../store/screenReads'
import { sessionOnPlanet } from '../../systems/authority/refinery/refineryFixtures'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { UI_IDS } from '../ids'
import { bayScreenById, shownBayScreenIdOf, type SliceBayScreen } from '../registries/bayScreens'
import { SliceBayScreenLayer } from './SliceBayScreenLayer'

// The `bayScreens` seam (K-b ticket 227, TD lock on #177): a fake slice owns the Upgrade bay's
// screen; a screen waiting on a schedule row stays hidden until the row opens, a vision row's never.

function ShowcaseProbe() {
  return createElement('span', { 'data-testid': 'showcase-probe' }, 'plaques')
}

const showcase = (featureId: string | null): SliceBayScreen => ({
  id: 'bay-probe.showcase',
  bay: 'upgrade',
  featureId,
  Screen: ShowcaseProbe,
})

const sliceWith = (...screens: SliceBayScreen[]): SliceDefinition => ({
  id: 'bay-probe',
  register: (r) => screens.forEach((screen) => r.bayScreen(screen)),
})

const onPlanet = (planetIndex: number) => sessionOnPlanet(planetIndex).state()

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
})

afterEach(() => uninstallRunLog())

describe('bay screens', () => {
  it("draws the kernel's own bay with no screen registered", () => {
    const state = createScriptedSession().state()
    expect(withRegistrations([], () => shownBayScreenIdOf(state, 'upgrade'))).toBeNull()
  })

  it("shows a slice's Upgrade bay screen, and its layer draws the slice's markup", () => {
    const slice = sliceWith(showcase(null))
    const html = withRegistrations([slice], () => {
      expect(readSliceBayScreenIdAt('upgrade')).toBe('bay-probe.showcase')
      const screen = bayScreenById('bay-probe.showcase')!
      return renderToString(createElement(SliceBayScreenLayer, { screen }))
    })
    expect(html).toContain('data-testid="showcase-probe"')
    expect(html).toContain('data-slice-screen="bay-probe.showcase"')
    expect(html).not.toContain(`data-testid="${UI_IDS.upgradebayScreen}"`)
  })

  it('leaves the other bays to the kernel', () => {
    const slice = sliceWith(showcase(null))
    withRegistrations([slice], () => {
      expect(readSliceBayScreenIdAt('sell')).toBeNull()
      expect(readSliceBayScreenIdAt('refinery')).toBeNull()
    })
  })

  it('keeps a screen hidden until its schedule row opens, then shows it', () => {
    const slice = sliceWith(showcase('planet_2'))
    withRegistrations([slice], () => {
      expect(shownBayScreenIdOf(onPlanet(1), 'upgrade')).toBeNull()
      expect(shownBayScreenIdOf(onPlanet(2), 'upgrade')).toBe('bay-probe.showcase')
    })
  })

  it("never shows a vision row's screen, even past the row's planet", () => {
    const slice = sliceWith(showcase('magma_tick'))
    expect(withRegistrations([slice], () => shownBayScreenIdOf(onPlanet(9), 'upgrade'))).toBeNull()
  })

  it('refuses at the seal a second screen for one bay, or a row the schedule lacks', () => {
    const second = { ...showcase(null), id: 'bay-probe.second' }
    expect(() => withRegistrations([sliceWith(showcase(null), second)], () => null)).toThrow(
      /"bay-probe.second" is a second screen for the upgrade bay/,
    )
    expect(() => withRegistrations([sliceWith(showcase('turntable_bay'))], () => null)).toThrow(
      /waits on "turntable_bay", no schedule row/,
    )
  })
})
