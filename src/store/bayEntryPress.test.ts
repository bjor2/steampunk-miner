import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { withRegistrations } from '../registries/registrar'
import { entryProbeSlice, probeSourceOf } from '../systems/registries/bayEntryFixtures'
import { UI_ID_TEMPLATES } from '../systems/views/screenIds'
import { resetGameStore, useGameStore } from './gameStore'
import { readUpgradeBayModel } from './screenReads'

// A press on a bay entry whose anchor is locked sends nothing (ticket 344): the entry is not on
// the screen, so neither a press nor a held confirm reaches the authority. `blasting_charges`
// opens on planet 7; the probe's buy is the kernel casing grade.

const RACK_BUY = UI_ID_TEMPLATES.upgradebayEntryBuy('entry-probe.rack')

const game = () => useGameStore.getState()

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

function dockOnPlanet(planetTier: number): void {
  game().setPlanet(planetTier)
  game().teleportToDock('upgrade')
  game().giveMoney('1e9')
}

function casingGrade(): number {
  return readUpgradeBayModel().casing.grade
}

function withChargesEntry(run: () => void): void {
  const charges = probeSourceOf('entry-probe.charges', 'blasting_charges', [
    { entryId: 'entry-probe.rack' },
  ])
  withRegistrations([entryProbeSlice([charges.source])], run)
}

describe('pressing a bay entry (ticket 344)', () => {
  it('sends nothing while the entry anchor is locked', () =>
    withChargesEntry(() => {
      dockOnPlanet(6)
      const grade = casingGrade()
      game().focusControl(RACK_BUY)
      expect(game().focusedControlId).not.toBe(RACK_BUY)
      expect(game().pressScreenButton(RACK_BUY)).toBe(false)
      expect(casingGrade()).toBe(grade)
    }))

  it('submits the slice command once the anchor is open', () =>
    withChargesEntry(() => {
      dockOnPlanet(7)
      const grade = casingGrade()
      expect(game().pressScreenButton(RACK_BUY)).toBe(true)
      expect(casingGrade()).toBe(grade + 1)
    }))
})
