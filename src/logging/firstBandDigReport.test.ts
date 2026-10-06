import { describe, expect, it } from 'vitest'
import {
  firstBandDigAlerts,
  firstBandDigRatio,
  formatFirstBandDigTable,
} from './firstBandDigReport'

describe('first band dig report (#81 sawtooth, #86)', () => {
  it('passes a planet whose band 1 digs in at most 0.7x its arrival time by departure', () => {
    expect(firstBandDigAlerts({ '1': { arrival: 40, departure: 28 } })).toEqual([])
  })

  it('alerts on a planet whose band 1 got less than 30% faster during the stay', () => {
    expect(firstBandDigAlerts({ '2': { arrival: 24, departure: 24 } })).toEqual([
      'planet 2 band 1 dug 0.40 s/m on arrival and 0.40 s/m at departure, target at most 0.7x',
    ])
  })

  it('passes an arrival the tip only skidded on and alerts on a departure that still skids', () => {
    expect(firstBandDigAlerts({ '3': { arrival: null, departure: 30 } })).toEqual([])
    expect(firstBandDigAlerts({ '4': { arrival: null, departure: null } })).toHaveLength(1)
  })

  it('gives the ratio of departure over arrival, or null without a dig on both sides', () => {
    expect(firstBandDigRatio({ arrival: 40, departure: 24 })).toBe(0.6)
    expect(firstBandDigRatio({ arrival: null, departure: 24 })).toBeNull()
  })

  it('prints one row per planet with both times and the ratio', () => {
    expect(formatFirstBandDigTable({ '1': { arrival: 40, departure: 24 } })).toBe(
      [
        '| planet | band 1 on arrival | band 1 at departure | ratio |',
        '| --- | --- | --- | --- |',
        '| 1 | 0.67 s/m | 0.40 s/m | 0.60x |',
      ].join('\n'),
    )
  })
})
