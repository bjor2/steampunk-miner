import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../money'
import { cargoGaugeText, energyGaugeText, hullGaugeText } from './vehicleReadout'

describe('vehicle readout', () => {
  it('shows energy in whole units of the tank, rounded down', () => {
    expect(energyGaugeText(26879, 36000)).toBe('111 / 150')
  })

  it('shows hull and cargo as amount over capacity', () => {
    expect(hullGaugeText(fromCanonical('62.7'), fromCanonical('125.44'))).toBe('63 / 125')
    expect(cargoGaugeText(3, 10)).toBe('3 / 10')
  })
})
