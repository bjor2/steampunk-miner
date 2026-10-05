import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { UI_ID_TEMPLATES, UI_IDS } from '../systems/views/screenIds'
import { resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'
import { readUpgradeBayModel } from './screenReads'

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  game().giveMoney('1e6')
  game().teleportToDock('upgrade')
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

describe('upgrade bay preview: part install (#44)', () => {
  it('starts installing the bought track part once upgrade_purchased comes back', () => {
    game().pressScreenButton(UI_ID_TEMPLATES.workshopUpgradeBuy('hull'))
    expect(readUpgradeBayModel().preview.installing).toBe('hull')
  })

  it('ends the install when the preview has run it', () => {
    game().pressScreenButton(UI_ID_TEMPLATES.workshopUpgradeBuy('hull'))
    game().endPartInstall()
    expect(readUpgradeBayModel().preview.installing).toBeNull()
  })

  it('changes the part at once with reduce motion on', () => {
    game().setPreference('shake', false)
    game().pressScreenButton(UI_ID_TEMPLATES.workshopUpgradeBuy('hull'))
    expect(readUpgradeBayModel().preview.installing).toBeNull()
    expect(readUpgradeBayModel().tracks.find((row) => row.upgradeId === 'hull')?.level).toBe(1)
  })

  it('installs no vehicle part for a casing grade', () => {
    game().pressScreenButton(UI_IDS.upgradebayCasingBuy)
    expect(readUpgradeBayModel().preview.installing).toBeNull()
  })

  it('never puts the install into the state digest', () => {
    game().pressScreenButton(UI_ID_TEMPLATES.workshopUpgradeBuy('hull'))
    const installing = takeSessionSnapshot().digest
    game().endPartInstall()
    expect(takeSessionSnapshot().digest).toBe(installing)
  })
})
