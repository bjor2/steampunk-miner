import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { toCanonical } from '../money'
import type { CommandIntent } from '../authority/authorityCommand'
import type { DomainEvent } from '../authority/domainEvent'
import { createScriptedSession, typesOf } from '../authority/scriptedSession'

// A slice's dock service refills its own state as a free side-effect of a paid recharge (#217);
// a fake slice registers one through withRegistrations, so no real slice is imported.

const grant = { type: 'debug.grantMoney', payload: { amount: '100' } } as const
const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const recharge = { type: 'rechargeEnergy', payload: {} } as const
const quickService = { type: 'quickService', payload: {} } as const
const setEnergy = (energy: string) => ({ type: 'debug.setEnergy', payload: { energy } }) as const

/** Says it refilled, with the player it refilled for; changes nothing else. */
const REFILL_PROBE: SliceDefinition = {
  id: 'dock-probe',
  register: (r) =>
    r.dockService({
      id: 'dock-probe.refill',
      onRecharge: (state, playerId) => ({
        state,
        events: [{ type: 'StorageFull', lostUnits: playerId === 'p1' ? 1 : 0 }],
      }),
    }),
}

/** Docked at the Sell bay with 100 in the wallet and `energy` in the tank, then `service`. */
function serviceWith(slices: readonly SliceDefinition[], energy: string, service: CommandIntent) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    session.submit(1, grant)
    session.submit(2, setEnergy(energy))
    session.submit(3, dock)
    const events: DomainEvent[] = session.submit(4, service)
    return { events, wallet: toCanonical(session.state().players.p1.wallet) }
  })
}

describe('dock services', () => {
  it('runs a registered service right after a paid recharge, as part of that command', () => {
    const { events } = serviceWith([REFILL_PROBE], '37.5', recharge)
    expect(typesOf(events)).toEqual(['EnergyRecharged', 'StorageFull'])
    expect(events[1]).toMatchObject({ playerId: 'p1', tick: 4, lostUnits: 1 })
  })

  it('leaves the recharge bill unchanged', () => {
    const plain = serviceWith([], '37.5', recharge)
    expect(serviceWith([REFILL_PROBE], '37.5', recharge).wallet).toBe(plain.wallet)
    expect(typesOf(plain.events)).toEqual(['EnergyRecharged'])
  })

  it("runs on quick service's recharge leg", () => {
    const { events } = serviceWith([REFILL_PROBE], '37.5', quickService)
    expect(typesOf(events)).toEqual(['EnergyRecharged', 'StorageFull'])
  })

  it('does not run when no recharge is paid', () => {
    const refused = serviceWith([REFILL_PROBE], '150', recharge)
    expect(typesOf(refused.events)).toEqual(['CommandRejected'])
  })
})
