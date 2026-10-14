import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import type { VehicleLook, VehicleLookFlash, VehicleLookSource } from '../registries/vehicleLooks'
import {
  createDrawnVehicleLook,
  createLookFlashes,
  drawVehicleLookAt,
  startLookFlashes,
  swapVeilForOutline,
  type DrawnVehicleLook,
  type LookFlashes,
} from './vehicleLookFold'

// The kernel's fold of the slices' looks on the local vehicle (ticket 389): sources while their
// state lasts, flashes for their ticks after an event, and the reduced-effects outline.

const PLAYER = 'p1'
/** The probes never read the state. */
const STATE = {} as AuthorityState
const BLUE = '#7fd4ff'
const RED = '#ff3b2f'

const VEIL: VehicleLook = { tint: BLUE, opacity: 0.5, outline: null, glows: [] }
const LANTERN_GLOW: VehicleLook = {
  tint: null,
  opacity: 1,
  outline: null,
  glows: [{ slots: ['lantern-frame'], colour: BLUE, glow: 0.8 }],
}
const RED_LIGHT: VehicleLook = {
  tint: null,
  opacity: 1,
  outline: null,
  glows: [{ slots: ['lantern-frame'], colour: RED, glow: 1 }],
}
const FLICKER: VehicleLookFlash = { ticks: 6, lookAt: () => RED_LIGHT }
const REFUSED = { type: 'DockLeft', playerId: PLAYER } as unknown as DomainEvent
const OTHERS_REFUSED = { type: 'DockLeft', playerId: 'p2' } as unknown as DomainEvent

/** A probe slice whose looks show from `fromTick` on and whose flash any `REFUSED` plays. */
function probeSlice(id: string, look: VehicleLook, fromTick = 0): SliceDefinition {
  const source: VehicleLookSource = {
    id: `${id}.look`,
    lookOf: (_state, _playerId, tick) => (tick >= fromTick ? look : null),
    flashOf: (event) => (event.type === 'DockLeft' ? FLICKER : null),
  }
  return { id, register: (r) => r.vehicleLook(source) }
}

function drawnAt(tick: number, flashes: LookFlashes = createLookFlashes()): DrawnVehicleLook {
  const drawn = createDrawnVehicleLook()
  drawVehicleLookAt(drawn, flashes, { state: STATE, playerId: PLAYER, tick })
  return drawn
}

describe('vehicle look', () => {
  it('draws the vehicle plain with no look registered', () => {
    withRegistrations([], () => {
      expect(drawnAt(10)).toEqual({ tint: null, opacity: 1, outline: null, glows: [] })
    })
  })

  it('wears a source’s tint and see-through body while its state lasts, and drops them after', () => {
    withRegistrations([probeSlice('veil-probe', VEIL, 5)], () => {
      expect(drawnAt(4)).toMatchObject({ tint: null, opacity: 1 })
      expect(drawnAt(5)).toMatchObject({ tint: BLUE, opacity: 0.5, outline: null })
    })
  })

  it('folds two sources: the first tint by id, the most see-through opacity, every glow', () => {
    const glass: VehicleLook = { tint: RED, opacity: 0.3, outline: null, glows: [] }
    withRegistrations(
      [
        probeSlice('b-probe', glass),
        probeSlice('a-probe', VEIL),
        probeSlice('c-probe', LANTERN_GLOW),
      ],
      () => {
        const drawn = drawnAt(1)
        expect(drawn.tint).toBe(BLUE)
        expect(drawn.opacity).toBe(0.3)
        expect(drawn.glows).toEqual(LANTERN_GLOW.glows)
      },
    )
  })

  it('plays an event’s flash for its ticks from the tick it is heard, then stops', () => {
    withRegistrations([probeSlice('flash-probe', VEIL, 1000)], () => {
      const flashes = createLookFlashes()
      startLookFlashes(flashes, [REFUSED], PLAYER, 20)
      expect(drawnAt(20, flashes).glows).toEqual(RED_LIGHT.glows)
      expect(drawnAt(25, flashes).glows).toEqual(RED_LIGHT.glows)
      expect(drawnAt(26, flashes).glows).toEqual([])
    })
  })

  it('plays no flash for another player’s event', () => {
    withRegistrations([probeSlice('flash-probe', VEIL, 1000)], () => {
      const flashes = createLookFlashes()
      startLookFlashes(flashes, [OTHERS_REFUSED], PLAYER, 20)
      expect(drawnAt(20, flashes).glows).toEqual([])
    })
  })

  it('restarts a source’s flash when its event comes again', () => {
    withRegistrations([probeSlice('flash-probe', VEIL, 1000)], () => {
      const flashes = createLookFlashes()
      startLookFlashes(flashes, [REFUSED], PLAYER, 20)
      startLookFlashes(flashes, [REFUSED], PLAYER, 24)
      expect(drawnAt(29, flashes).glows).toEqual(RED_LIGHT.glows)
      expect(drawnAt(30, flashes).glows).toEqual([])
    })
  })
})

describe('vehicle look under reduced effects', () => {
  it('swaps the tint and see-through body for one outline in the tint’s colour', () => {
    withRegistrations([probeSlice('veil-probe', VEIL)], () => {
      const drawn = drawnAt(1)
      swapVeilForOutline(drawn)
      expect(drawn).toEqual({ tint: null, opacity: 1, outline: BLUE, glows: [] })
    })
  })

  it('keeps an outline a source asked for, as the one outline', () => {
    const outlined: VehicleLook = { ...VEIL, outline: RED }
    withRegistrations([probeSlice('veil-probe', outlined)], () => {
      const drawn = drawnAt(1)
      swapVeilForOutline(drawn)
      expect(drawn).toMatchObject({ tint: null, opacity: 1, outline: RED })
    })
  })

  it('draws no outline over a plain vehicle', () => {
    withRegistrations([probeSlice('glow-probe', LANTERN_GLOW)], () => {
      const drawn = drawnAt(1)
      swapVeilForOutline(drawn)
      expect(drawn).toEqual({ ...LANTERN_GLOW, glows: LANTERN_GLOW.glows })
    })
  })
})
