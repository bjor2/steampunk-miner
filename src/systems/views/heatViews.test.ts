import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../authority/scriptedSession'
import { liningTypeUnlockPrice } from '../economy/heatEconomy'
import { toCanonical } from '../money'
import { heatReadingOf, THROTTLED_TEXT } from './heatReading'
import { liningRowOf } from './liningRow'

function onPlanet(planetIndex: number) {
  const session = createScriptedSession()
  session.submit(1, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(1, { type: 'debug.setMoney', payload: { amount: '1e30' } })
  session.submit(1, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

describe('heat gauge on the HUD (#113)', () => {
  it('shows nothing off the heat planets', () => {
    expect(heatReadingOf(onPlanet(7).state(), 'p1')).toBeNull()
  })

  it('reads the gauge out of 100 and marks the throttle in words above 70', () => {
    const session = onPlanet(8)
    session.submit(2, { type: 'debug.setHeat', payload: { heat: 70 } })
    expect(heatReadingOf(session.state(), 'p1')).toMatchObject({
      text: '70 / 100',
      permille: 700,
      isThrottled: false,
    })
    session.submit(3, { type: 'debug.setHeat', payload: { heat: 85 } })
    expect(heatReadingOf(session.state(), 'p1')).toMatchObject({
      isThrottled: true,
      throttledText: THROTTLED_TEXT,
      iconId: 'icon-heat-lava',
    })
  })
})

describe('the Upgrade bay lining row (#113)', () => {
  it('is not offered before planet 8', () => {
    expect(liningRowOf(onPlanet(7).state(), 'p1')).toBeNull()
  })

  it('offers refractory for its unlock price while standard lining is in use', () => {
    const row = liningRowOf(onPlanet(8).state(), 'p1')
    expect(row).toMatchObject({ activeText: 'Standard', button: { label: 'Unlock', reason: null } })
    expect(row?.cost.exact).toBe(toCanonical(liningTypeUnlockPrice('refractory', 8)))
    expect(row?.effectText).toContain('1.5× lining charge')
  })

  it('switches between the two types once refractory is owned, for nothing', () => {
    const session = onPlanet(8)
    session.submit(2, { type: 'buyLiningType', payload: { liningType: 'refractory' } })
    expect(liningRowOf(session.state(), 'p1')).toMatchObject({
      activeText: 'Refractory',
      button: { label: 'Use Standard' },
    })
    session.submit(3, { type: 'selectLiningType', payload: { liningType: 'standard' } })
    expect(liningRowOf(session.state(), 'p1')?.button.label).toBe('Use Refractory')
  })
})
