import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createScriptedSession } from '../authority/scriptedSession'
import { isBoreLineWanted, type BoreLineListener } from './boreLineListeners'
import { RegistrationRefusedError } from './seal'

// The bore line listeners (ticket 412, the TD lock on #320): a sealed kernel list a slice asks
// through for a shot's opened cells. Fake slices register through withRegistrations.

function listening(...listeners: BoreLineListener[]): SliceDefinition {
  return {
    id: 'probe',
    register: (r) => listeners.forEach((listener) => r.boreLineListener(listener)),
  }
}

function listener(id: string, wants: boolean): BoreLineListener {
  return { id, wantsLine: () => wants }
}

function wantedWith(slice: SliceDefinition, playerId = 'p1'): boolean {
  return withRegistrations([slice], () =>
    isBoreLineWanted(createScriptedSession().state(), playerId),
  )
}

describe('bore line listeners (ticket 412)', () => {
  it('wants no line with no listener registered', () => {
    expect(wantedWith(listening())).toBe(false)
  })

  it('wants no line while every listener answers false', () => {
    expect(wantedWith(listening(listener('probe.a', false), listener('probe.b', false)))).toBe(
      false,
    )
  })

  it('wants the line when any one listener answers true', () => {
    expect(wantedWith(listening(listener('probe.a', false), listener('probe.b', true)))).toBe(true)
  })

  it('asks each listener for the player whose shot ends', () => {
    const wantsP2: BoreLineListener = { id: 'probe.p2', wantsLine: (_, id) => id === 'p2' }
    expect(wantedWith(listening(wantsP2), 'p1')).toBe(false)
    expect(wantedWith(listening(wantsP2), 'p2')).toBe(true)
  })

  it('refuses a listener whose id names a row of the unlock schedule', () => {
    const naming = listening(listener('probe.auto_guns', true))
    expect(() => wantedWith(naming)).toThrow(RegistrationRefusedError)
    expect(() => wantedWith(naming)).toThrow(/unlock id "auto_guns"/)
  })

  it("refuses a listener whose id lacks its slice's prefix", () => {
    expect(() => wantedWith(listening(listener('line', true)))).toThrow(RegistrationRefusedError)
  })
})
