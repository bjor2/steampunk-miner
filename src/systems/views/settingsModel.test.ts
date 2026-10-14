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
    bindingProblems: [],
    rebindingActionId,
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
    const row = rowOf(sourcesWith({ use_slot_5: { gamepad: ['PadRT'] } }, null), 'use_slot_5')
    expect(row?.padText).toBe('RT')
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
