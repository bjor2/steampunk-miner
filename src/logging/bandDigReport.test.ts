import { describe, expect, it } from 'vitest'
import { bandDigAlerts, bandDigRatio, formatBandDigTable } from './bandDigReport'

describe('band dig report (#81 sawtooth, #86)', () => {
  it('passes a planet whose band digs in at most 0.7x its arrival time by departure', () => {
    expect(bandDigAlerts({ '1': { arrival: 40, departure: 28 } }, 5)).toEqual([])
  })

  it('alerts on a planet whose band got less than 30% faster during the stay', () => {
    expect(bandDigAlerts({ '2': { arrival: 24, departure: 24 } }, 1)).toEqual([
      'planet 2 band 1 dug 0.40 s/m on arrival and 0.40 s/m at departure, target at most 0.7x',
    ])
  })

  it('passes an arrival the tip only skidded on and alerts on a departure that still skids', () => {
    expect(bandDigAlerts({ '3': { arrival: null, departure: 30 } }, 5)).toEqual([])
    expect(bandDigAlerts({ '4': { arrival: null, departure: null } }, 5)).toHaveLength(1)
  })

  it('gives the ratio of departure over arrival, or null without a dig on both sides', () => {
    expect(bandDigRatio({ arrival: 40, departure: 24 })).toBe(0.6)
    expect(bandDigRatio({ arrival: null, departure: 24 })).toBeNull()
  })

  it('prints one row per planet with both times and the ratio', () => {
    expect(formatBandDigTable({ '1': { arrival: 40, departure: 24 } }, 5)).toBe(
      [
        '| planet | band 5 on arrival | band 5 at departure | ratio |',
        '| --- | --- | --- | --- |',
        '| 1 | 0.67 s/m | 0.40 s/m | 0.60x |',
      ].join('\n'),
    )
  })
})
