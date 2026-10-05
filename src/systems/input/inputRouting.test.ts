import { describe, expect, it } from 'vitest'
import { reactionToPress, topLayerOf, type InputSituation } from './inputRouting'

const DRIVING: InputSituation = {
  layer: 'vehicle',
  vehicleMode: 'active',
  dockableBay: null,
  dockedBay: null,
}
const ON_PAD: InputSituation = { ...DRIVING, dockableBay: 'sell' }
const DOCKED: InputSituation = {
  layer: 'platform',
  vehicleMode: 'docked',
  dockableBay: null,
  dockedBay: 'sell',
}
const AT_UPGRADE_BAY: InputSituation = { ...DOCKED, dockedBay: 'upgrade' }
const SETTINGS: InputSituation = { ...DRIVING, layer: 'settings' }

const submitted = (type: string, payload: object = {}) => ({
  kind: 'submit',
  intent: { type, payload },
})

describe('input routing', () => {
  it('docks on interact exactly when the authority would accept the dock', () => {
    expect(reactionToPress('interact', ON_PAD)).toEqual(submitted('dock', { bay: 'sell' }))
    expect(reactionToPress('interact', DRIVING)).toEqual({ kind: 'none' })
  })

  it('docks at the bay the vehicle stands in', () => {
    expect(reactionToPress('interact', { ...DRIVING, dockableBay: 'upgrade' })).toEqual(
      submitted('dock', { bay: 'upgrade' }),
    )
  })

  it('undocks when the platform screen is closed with ui_cancel', () => {
    expect(reactionToPress('ui_cancel', DOCKED)).toEqual(submitted('undock'))
  })

  it('runs the quick service only at the Sell bay', () => {
    expect(reactionToPress('quick_service', DOCKED)).toEqual(submitted('quickService'))
    expect(reactionToPress('quick_service', AT_UPGRADE_BAY)).toEqual({ kind: 'none' })
    expect(reactionToPress('quick_service', DRIVING)).toEqual({ kind: 'none' })
  })

  it('calls the tow only for a stranded or destroyed vehicle', () => {
    for (const vehicleMode of ['stranded', 'destroyed'] as const) {
      expect(reactionToPress('request_rescue', { ...DRIVING, vehicleMode })).toEqual(
        submitted('requestRescue'),
      )
    }
    expect(reactionToPress('request_rescue', DRIVING)).toEqual({ kind: 'none' })
  })

  it('closes the top layer with Escape: settings first, then the platform screen', () => {
    expect(reactionToPress('open_settings', DRIVING)).toEqual({ kind: 'openSettings' })
    expect(reactionToPress('ui_cancel', SETTINGS)).toEqual({ kind: 'closeSettings' })
    expect(reactionToPress('ui_cancel', DOCKED)).toEqual(submitted('undock'))
  })

  it('moves menu focus only on a menu layer', () => {
    expect(reactionToPress('ui_down', DOCKED)).toEqual({ kind: 'moveFocus', step: 1 })
    expect(reactionToPress('ui_up', SETTINGS)).toEqual({ kind: 'moveFocus', step: -1 })
    expect(reactionToPress('ui_down', DRIVING)).toEqual({ kind: 'none' })
  })

  it('zooms from the vehicle layer only, as a local setting rather than a command', () => {
    expect(reactionToPress('zoom_in', DRIVING)).toEqual({ kind: 'zoom', change: 'in' })
    expect(reactionToPress('zoom_out', DRIVING)).toEqual({ kind: 'zoom', change: 'out' })
    expect(reactionToPress('zoom_reset', DRIVING)).toEqual({ kind: 'zoom', change: 'reset' })
    expect(reactionToPress('zoom_in', DOCKED)).toEqual({ kind: 'none' })
  })

  it('puts settings over everything and the platform screen over the vehicle while docked', () => {
    expect(topLayerOf('docked', true)).toBe('settings')
    expect(topLayerOf('docked', false)).toBe('platform')
    expect(topLayerOf('stranded', false)).toBe('vehicle')
  })
})
