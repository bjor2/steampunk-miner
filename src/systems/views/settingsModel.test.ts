import { describe, expect, it } from 'vitest'
import { ACTION_MAP, bindingsWithOverrides } from '../input/actionMap'
import { DEFAULT_PREFERENCES } from '../input/preferences'
import { selectSettingsModel, type SettingsSources } from './settingsModel'

function sourcesWith(overrides: unknown, rebindingActionId: SettingsSources['rebindingActionId']) {
  const { bindings, padBindings } = bindingsWithOverrides(ACTION_MAP, overrides)
  return {
    prefs: DEFAULT_PREFERENCES,
    bindings,
    padBindings,
    inputDevice: 'keyboard' as const,
    bindingProblems: [],
    rebindingActionId,
    saveTransferProblems: [],
  }
}

const rowOf = (sources: SettingsSources, actionId: string) =>
  selectSettingsModel(sources).bindings.find((row) => row.actionId === actionId)

describe('settings model: bindings (ticket 346)', () => {
  it('shows each action with its key and its pad button', () => {
    const row = rowOf(sourcesWith({}, null), 'toggle_auto_fire')
    expect(row).toMatchObject({ keyText: 'T', padText: 'R-stick click', isWaitingForKey: false })
  })

  it('shows a rebound pad button', () => {
    const row = rowOf(sourcesWith({ use_slot_5: { gamepad: ['PadLB+PadX'] } }, null), 'use_slot_5')
    expect(row?.padText).toBe('LB+X')
  })

  it('asks for a key or pad button while the action waits', () => {
    const row = rowOf(sourcesWith({}, 'interact'), 'interact')
    expect(row).toMatchObject({
      keyText: 'Press a key or pad button to rebind',
      padText: '',
      isWaitingForKey: true,
    })
  })
})

describe('settings model: saves (ticket 479)', () => {
  it('offers Export and Import as focus stops between the controls and Close', () => {
    const model = selectSettingsModel(sourcesWith({}, null))
    const ids = model.focusStops.map((stop) => stop.id)
    const exportAt = ids.indexOf(model.saves.exportSave.id)
    expect(ids.slice(exportAt, exportAt + 3)).toEqual([
      model.saves.exportSave.id,
      model.saves.importSave.id,
      model.close.id,
    ])
    expect([model.saves.exportSave.reason, model.saves.importSave.reason]).toEqual([null, null])
  })

  it('shows why the last export or import was refused', () => {
    const sources = { ...sourcesWith({}, null), saveTransferProblems: ['save is not JSON'] }
    expect(selectSettingsModel(sources).saves.problems).toEqual(['save is not JSON'])
  })
})
