import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { applyCommand } from '../authority/applyCommand'
import { createAuthorityState } from '../authority/authorityState'
import { AUTO_ON, searSlice } from '../authority/bore/boreAutoFixtures'
import { reactionToPress, topLayerOf, type InputSituation } from './inputRouting'

const START = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })

const DRIVING: InputSituation = {
  layer: 'vehicle',
  vehicleMode: 'active',
  dockableBay: null,
  dockedBay: null,
  canOpenArtefactCache: false,
  gunMode: null,
  plantableChargeSize: null,
  nextChargeSize: null,
  state: START,
  playerId: 'p1',
}
const ON_PAD: InputSituation = { ...DRIVING, dockableBay: 'sell' }
const DOCKED: InputSituation = {
  layer: 'platform',
  vehicleMode: 'docked',
  dockableBay: null,
  dockedBay: 'sell',
  canOpenArtefactCache: false,
  gunMode: null,
  plantableChargeSize: null,
  nextChargeSize: null,
  state: START,
  playerId: 'p1',
}
const OVER_CACHE: InputSituation = { ...DRIVING, canOpenArtefactCache: true }
const AT_UPGRADE_BAY: InputSituation = { ...DOCKED, dockedBay: 'upgrade' }
const SETTINGS: InputSituation = { ...DRIVING, layer: 'settings' }
const CARDS: InputSituation = { ...DRIVING, layer: 'artefact' }
const SLICE_SCREEN: InputSituation = { ...DOCKED, layer: 'screen' }
const NO_OVERLAY = { isSettingsOpen: false, isArtefactChoiceOpen: false, openScreenId: null }

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

  it('opens the artefact cache on interact exactly when the authority would accept it (#46)', () => {
    expect(reactionToPress('interact', OVER_CACHE)).toEqual(submitted('openArtefactCache'))
  })

  it('closes the cache cards with ui_cancel, sending nothing, and moves focus on them', () => {
    expect(reactionToPress('ui_cancel', CARDS)).toEqual({ kind: 'closeArtefactChoice' })
    expect(reactionToPress('ui_right', CARDS)).toEqual({ kind: 'moveFocus', step: 1 })
    expect(reactionToPress('ui_confirm', CARDS)).toEqual({ kind: 'activateFocused' })
    expect(reactionToPress('interact', CARDS)).toEqual({ kind: 'none' })
  })

  it('switches mounted guns between auto and off, and does nothing with no guns (#107)', () => {
    expect(reactionToPress('toggle_guns', { ...DRIVING, gunMode: 'auto' })).toEqual(
      submitted('setGunMode', { mode: 'off' }),
    )
    expect(reactionToPress('toggle_guns', { ...DRIVING, gunMode: 'off' })).toEqual(
      submitted('setGunMode', { mode: 'auto' }),
    )
    expect(reactionToPress('toggle_guns', DRIVING)).toEqual({ kind: 'none' })
  })

  it('switches the bore gun to auto and back once the steam sear is researched (ticket 317)', () => {
    withRegistrations([searSlice()], () => {
      expect(reactionToPress('toggle_auto_fire', DRIVING)).toEqual(
        submitted('ground_gun.set_auto', { on: true }),
      )
      const command = { playerId: 'p1', tick: 1, seq: 1, ...AUTO_ON }
      const switchedOn = applyCommand(START, command).state
      expect(reactionToPress('toggle_auto_fire', { ...DRIVING, state: switchedOn })).toEqual(
        submitted('ground_gun.set_auto', { on: false }),
      )
    })
    withRegistrations([searSlice({ researched: [] })], () => {
      expect(reactionToPress('toggle_auto_fire', DRIVING)).toEqual({ kind: 'none' })
    })
  })

  it('plants a charge only when the authority would take it, and never from the pad screen (#109)', () => {
    expect(reactionToPress('plant_charge', { ...DRIVING, plantableChargeSize: 1 })).toEqual(
      submitted('plantCharge', { size: 1 }),
    )
    expect(reactionToPress('plant_charge', DRIVING)).toEqual({ kind: 'none' })
    expect(reactionToPress('plant_charge', { ...DOCKED, plantableChargeSize: 1 })).toEqual({
      kind: 'none',
    })
  })

  it('plants the size it would plant, naming it in the command (#218)', () => {
    expect(reactionToPress('plant_charge', { ...DRIVING, plantableChargeSize: 4 })).toEqual(
      submitted('plantCharge', { size: 4 }),
    )
  })

  it('steps the charge size on next_charge_size only with two sizes in the rack (#153)', () => {
    expect(reactionToPress('next_charge_size', { ...DRIVING, nextChargeSize: 3 })).toEqual({
      kind: 'chooseChargeSize',
      size: 3,
    })
    expect(reactionToPress('next_charge_size', DRIVING)).toEqual({ kind: 'none' })
    expect(reactionToPress('next_charge_size', { ...DOCKED, nextChargeSize: 3 })).toEqual({
      kind: 'none',
    })
  })

  it('undocks when the platform screen is closed with ui_cancel', () => {
    expect(reactionToPress('ui_cancel', DOCKED)).toEqual(submitted('undock'))
  })

  it('runs the quick service at either shop, never at the Refinery (#170)', () => {
    expect(reactionToPress('quick_service', DOCKED)).toEqual(submitted('quickService'))
    expect(reactionToPress('quick_service', AT_UPGRADE_BAY)).toEqual(submitted('quickService'))
    expect(reactionToPress('quick_service', { ...DOCKED, dockedBay: 'refinery' })).toEqual({
      kind: 'none',
    })
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
    expect(topLayerOf('docked', { ...NO_OVERLAY, isSettingsOpen: true })).toBe('settings')
    expect(topLayerOf('docked', NO_OVERLAY)).toBe('platform')
    expect(topLayerOf('stranded', NO_OVERLAY)).toBe('vehicle')
  })

  it('puts the cache cards over the vehicle and under settings', () => {
    const cardsOpen = { ...NO_OVERLAY, isArtefactChoiceOpen: true }
    expect(topLayerOf('active', cardsOpen)).toBe('artefact')
    expect(topLayerOf('active', { ...cardsOpen, isSettingsOpen: true })).toBe('settings')
  })

  it('puts a slice screen over the dock screen and the vehicle, and under the cards', () => {
    const screenOpen = { ...NO_OVERLAY, openScreenId: 'example.screen' }
    expect(topLayerOf('docked', screenOpen)).toBe('screen')
    expect(topLayerOf('active', screenOpen)).toBe('screen')
    expect(topLayerOf('active', { ...screenOpen, isArtefactChoiceOpen: true })).toBe('artefact')
  })

  it('dismisses a slice screen on Back without undocking, and drives nothing under it', () => {
    expect(reactionToPress('ui_cancel', SLICE_SCREEN)).toEqual({ kind: 'dismissScreen' })
    expect(reactionToPress('quick_service', SLICE_SCREEN)).toEqual({ kind: 'none' })
    expect(reactionToPress('interact', SLICE_SCREEN)).toEqual({ kind: 'none' })
  })
})

// A slice answers an action the kernel table leaves open, such as a power-up slot (#217); a fake
// slice registers through withRegistrations, so no real slice is imported.
const SLOT_PROBE: SliceDefinition = {
  id: 'slot-probe',
  register: (r) => {
    r.inputReaction({
      id: 'slot-probe.use_1',
      actionId: 'use_slot_1',
      contexts: ['vehicle'],
      toIntent: ({ playerId }) =>
        playerId === 'p1' ? { type: 'plantCharge', payload: { size: 1 } } : null,
    })
    r.inputReaction({
      id: 'slot-probe.use_2',
      actionId: 'use_slot_2',
      contexts: ['vehicle'],
      toIntent: () => null,
    })
    r.inputReaction({
      id: 'slot-probe.interact',
      actionId: 'interact',
      contexts: ['vehicle'],
      toIntent: () => ({ type: 'plantCharge', payload: { size: 1 } }),
    })
  },
}

const pressWithProbe = (action: Parameters<typeof reactionToPress>[0], at: InputSituation) =>
  withRegistrations([SLOT_PROBE], () => reactionToPress(action, at))

describe('input routing: slice reactions', () => {
  it("submits a slice's intent for a filled power-up slot", () => {
    expect(pressWithProbe('use_slot_1', DRIVING)).toEqual(submitted('plantCharge', { size: 1 }))
  })

  it('does nothing for an empty slot, a slot no slice answers, or with no slice registered', () => {
    expect(pressWithProbe('use_slot_2', DRIVING)).toEqual({ kind: 'none' })
    expect(pressWithProbe('use_slot_5', DRIVING)).toEqual({ kind: 'none' })
    expect(withRegistrations([], () => reactionToPress('use_slot_1', DRIVING))).toEqual({
      kind: 'none',
    })
  })

  it('answers only in the contexts the reaction lists', () => {
    expect(pressWithProbe('use_slot_1', DOCKED)).toEqual({ kind: 'none' })
  })

  it("never overrides the kernel's own rule for an action", () => {
    expect(pressWithProbe('interact', ON_PAD)).toEqual(submitted('dock', { bay: 'sell' }))
    expect(pressWithProbe('interact', DRIVING)).toEqual({ kind: 'none' })
  })

  it('asks the slices on the plant key only while the kernel has nothing to plant (#153, #149)', () => {
    const PLUNGER_PROBE: SliceDefinition = {
      id: 'plunger-probe',
      register: (r) =>
        r.inputReaction({
          id: 'plunger-probe.detonate',
          actionId: 'plant_charge',
          contexts: ['vehicle'],
          toIntent: () => ({ type: 'requestRescue', payload: {} }),
        }),
    }
    const press = (at: InputSituation) =>
      withRegistrations([PLUNGER_PROBE], () => reactionToPress('plant_charge', at))
    expect(press(DRIVING)).toEqual(submitted('requestRescue'))
    expect(press({ ...DRIVING, plantableChargeSize: 2 })).toEqual(
      submitted('plantCharge', { size: 2 }),
    )
    expect(withRegistrations([], () => reactionToPress('plant_charge', DRIVING))).toEqual({
      kind: 'none',
    })
  })
})
