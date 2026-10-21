import { describe, expect, it } from 'vitest'
import { iconEntryOf } from '../art/icons/iconSet'
import {
  CLUSTER_ACTION_IDS,
  chargeSizeBadgeOf,
  clusterActionsOf,
  clusterIconIdOf,
  knobOffsetOf,
  heldChangesOf,
  isDoubleTap,
  isSlotHeldForCard,
  isGestureSurfaceShown,
  isPauseButtonShown,
  isStickShown,
  pinchZoomStepsOf,
  stickActionsOf,
  type TouchSituation,
} from './touchControls'

const AT_REST_P1: TouchSituation = {
  layer: 'vehicle',
  vehicleMode: 'active',
  dockedBay: null,
  hasChargeRack: false,
  plantingChargeSize: 1,
  nextChargeSize: null,
}

/** A rack holding sizes 1 and 4, planting 4 next press. */
const RACKED_TWO_SIZES: TouchSituation = {
  ...AT_REST_P1,
  hasChargeRack: true,
  plantingChargeSize: 4,
  nextChargeSize: 1,
}

describe('touch stick (#173)', () => {
  it.each([
    ['up', 0, -40, ['lift']],
    ['down', 0, 40, ['aim_down']],
    ['left', -40, 0, ['aim_left']],
    ['right', 40, 0, ['aim_right']],
    ['up-left', -30, -30, ['lift', 'aim_left']],
    ['up-right', 30, -30, ['lift', 'aim_right']],
    ['down-left', -30, 30, ['aim_down', 'aim_left']],
    ['down-right', 30, 30, ['aim_down', 'aim_right']],
  ])('holds the keys of %s, as W, S, A and D would', (_, dx, dy, actions) => {
    expect(stickActionsOf({ dx, dy })).toEqual(actions)
  })

  it('holds nothing inside the 20% deadzone of its 56 px travel', () => {
    expect(stickActionsOf({ dx: 11, dy: 0 })).toEqual([])
    expect(stickActionsOf({ dx: 12, dy: 0 })).toEqual(['aim_right'])
  })

  it('reads a push within 22.5 degrees of an axis as that axis alone', () => {
    expect(stickActionsOf({ dx: 40, dy: -16 })).toEqual(['aim_right'])
    expect(stickActionsOf({ dx: 40, dy: -17 })).toEqual(['lift', 'aim_right'])
  })

  it('shows only while the vehicle has the input', () => {
    expect(isStickShown('vehicle')).toBe(true)
    expect(isStickShown('platform')).toBe(false)
    expect(isStickShown('settings')).toBe(false)
  })
})

describe('touch gesture surface (ticket 684)', () => {
  it('lies over the HUD only while the touch controls show and the vehicle has the input', () => {
    expect(isGestureSurfaceShown(true, 'vehicle')).toBe(true)
    expect(isGestureSurfaceShown(false, 'vehicle')).toBe(false)
    expect(isGestureSurfaceShown(true, 'settings')).toBe(false)
  })
})

describe('touch pause button (ticket 472)', () => {
  it('shows only while the vehicle has the input, where the docked screen has its own', () => {
    expect(isPauseButtonShown('vehicle')).toBe(true)
    expect(isPauseButtonShown('platform')).toBe(false)
    expect(isPauseButtonShown('pause')).toBe(false)
  })
})

describe('touch cluster (#173)', () => {
  it('shows just Interact on a fresh planet 1 rig', () => {
    expect(clusterActionsOf(AT_REST_P1)).toEqual(['interact'])
  })

  it('adds Quick service docked at the Sell bay and drops the driving buttons', () => {
    expect(clusterActionsOf({ ...AT_REST_P1, layer: 'platform', dockedBay: 'sell' })).toEqual([
      'quick_service',
    ])
    expect(clusterActionsOf({ ...AT_REST_P1, layer: 'platform', dockedBay: 'upgrade' })).toEqual([])
  })

  it('keeps Plant charge and the guns toggle off the cluster, on the tool slot bar (ticket 691)', () => {
    expect(clusterActionsOf({ ...AT_REST_P1, hasChargeRack: true })).toEqual(['interact'])
  })

  it('shows Rescue only while the vehicle waits for the tow', () => {
    expect(clusterActionsOf({ ...AT_REST_P1, vehicleMode: 'stranded' })).toContain('request_rescue')
    expect(clusterActionsOf({ ...AT_REST_P1, vehicleMode: 'destroyed' })).toContain(
      'request_rescue',
    )
    expect(clusterActionsOf(AT_REST_P1)).not.toContain('request_rescue')
  })

  it('shows nothing over the settings overlay', () => {
    expect(clusterActionsOf({ ...AT_REST_P1, layer: 'settings' })).toEqual([])
  })
})

describe('touch charge size badge (ticket 473)', () => {
  it('shows the planting size on Plant charge while the rack holds two sizes', () => {
    expect(chargeSizeBadgeOf(RACKED_TWO_SIZES)).toBe(4)
  })

  it('draws nothing with one size in the rack, no rack, or off the vehicle layer', () => {
    expect(chargeSizeBadgeOf({ ...RACKED_TWO_SIZES, nextChargeSize: null })).toBeNull()
    expect(chargeSizeBadgeOf({ ...RACKED_TWO_SIZES, hasChargeRack: false })).toBeNull()
    expect(chargeSizeBadgeOf({ ...RACKED_TWO_SIZES, layer: 'platform' })).toBeNull()
  })
})

describe('touch glyphs and knob', () => {
  it('draws every cluster button with a glyph of the icon set', () => {
    for (const action of CLUSTER_ACTION_IDS)
      expect(iconEntryOf(clusterIconIdOf(action))).not.toBeNull()
  })

  it('keeps the knob inside the 56 px travel however far the thumb goes', () => {
    expect(knobOffsetOf({ dx: 30, dy: 0 })).toEqual({ dx: 30, dy: 0 })
    expect(knobOffsetOf({ dx: 0, dy: -112 })).toEqual({ dx: 0, dy: -56 })
  })
})

describe('touch zoom (#173)', () => {
  it('counts one zoom step per factor of 1.25 a pinch spreads or closes', () => {
    expect(pinchZoomStepsOf(100, 124)).toBe(0)
    expect(pinchZoomStepsOf(100, 126)).toBe(1)
    expect(pinchZoomStepsOf(100, 160)).toBe(2)
    expect(pinchZoomStepsOf(100, 79)).toBe(-1)
  })

  it('takes two taps within 300 ms and 24 px as a double tap', () => {
    const first = { x: 100, y: 100, atMs: 1000 }
    expect(isDoubleTap(null, first)).toBe(false)
    expect(isDoubleTap(first, { x: 110, y: 105, atMs: 1250 })).toBe(true)
    expect(isDoubleTap(first, { x: 110, y: 105, atMs: 1400 })).toBe(false)
    expect(isDoubleTap(first, { x: 160, y: 100, atMs: 1100 })).toBe(false)
  })
})

describe('touch held actions', () => {
  it('releases what the stick left and presses what it reached', () => {
    expect(heldChangesOf(['lift', 'aim_left'], ['aim_left'])).toEqual({
      released: ['lift'],
      pressed: [],
    })
    expect(heldChangesOf(['aim_left'], ['aim_down', 'aim_right'])).toEqual({
      released: ['aim_left'],
      pressed: ['aim_down', 'aim_right'],
    })
  })
})

describe('touch slot buttons (#217)', () => {
  it('count a press under 400 ms as a tap and one of 400 ms or more as a hold for the card', () => {
    expect(isSlotHeldForCard(1000, 1399)).toBe(false)
    expect(isSlotHeldForCard(1000, 1400)).toBe(true)
  })
})
