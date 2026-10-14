import { describe, expect, it } from 'vitest'
import { driveScreenAngle, stripMetresLabel, stripSecondsLabel } from './hazardStripView'

describe('hazard strip view', () => {
  it('labels whole metres under 1,000 and compact numbers past it, with no maximum', () => {
    expect([999.9, 1000, 12_480, 3_400_000, 7.2e9, 5e15].map(stripMetresLabel)).toEqual([
      '999 m',
      '1.0k m',
      '12.4k m',
      '3.4M m',
      '7.2G m',
      '5.0e+15 m',
    ])
  })

  it('labels arrival in tenths of a second, and a rig at rest as never arriving', () => {
    expect([0.96, 1.5, Infinity].map(stripSecondsLabel)).toEqual(['0.9 s', '1.5 s', '—'])
  })

  it('points the strip down the screen for a dig down, and right for a dig to the right', () => {
    const screenDirectionOf = (angle: number) => [-Math.sin(angle), Math.cos(angle)]
    const down = screenDirectionOf(driveScreenAngle(0, { x: 0, y: 1 }, { x: 0, y: -1 }))
    const right = screenDirectionOf(driveScreenAngle(0, { x: 1, y: 0 }, { x: 0, y: -1 }))
    expect(down.map((value) => Math.round(value))).toEqual([0, -1])
    expect(right.map((value) => Math.round(value))).toEqual([1, 0])
  })
})
