import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { withRegistrations } from '../registries/registrar'
import { entryProbeSlice, probeSourceOf } from '../systems/registries/bayEntryFixtures'
import { UI_ID_TEMPLATES } from '../systems/views/screenIds'
import { resetGameStore, useGameStore } from './gameStore'
import { readUpgradeBayModel } from './screenReads'

// A press on a bay entry whose anchor is held sends nothing (ticket 344): the entry is not on
// the screen, so neither a press nor a held confirm reaches the authority. Since #411 a planet
// only prices a row, so `blasting_charges` (planet 7) is on sale from planet 1 and only a vision
// row such as `magma_tick` holds an entry back. The probe's buy is the kernel casing grade.

const RACK_BUY = UI_ID_TEMPLATES.upgradebayEntryBuy('entry-probe.rack')
const TICK_BUY = UI_ID_TEMPLATES.upgradebayEntryBuy('entry-probe.tick')

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

function withVisionEntry(run: () => void): void {
  const vision = probeSourceOf('entry-probe.magma', 'magma_tick', [{ entryId: 'entry-probe.tick' }])
  withRegistrations([entryProbeSlice([vision.source])], run)
}

describe('pressing a bay entry (ticket 344)', () => {
  it('sends nothing while the entry anchor is a held vision row', () =>
    withVisionEntry(() => {
      dockOnPlanet(12)
      const grade = casingGrade()
      game().focusControl(TICK_BUY)
      expect(game().focusedControlId).not.toBe(TICK_BUY)
      expect(game().pressScreenButton(TICK_BUY)).toBe(false)
      expect(casingGrade()).toBe(grade)
    }))

  it("submits the slice command before its anchor's planet: the planet only prices it (#411)", () =>
    withChargesEntry(() => {
      dockOnPlanet(1)
      const grade = casingGrade()
      expect(game().pressScreenButton(RACK_BUY)).toBe(true)
      expect(casingGrade()).toBe(grade + 1)
    }))
})
