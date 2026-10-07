import { describe, expect, it } from 'vitest'
import { driveSignsOfIntent, isDriveSigns, signOfPush } from './driveSigns'
import { IDLE_INTENT } from './vehicleIntent'
import { FACING } from './vehiclePose'

describe('drive signs', () => {
  it('counts a side push only from halfway, so 0.4 drives straight and 0.6 to that side', () => {
    expect(signOfPush(0.4)).toBe(0)
    expect(signOfPush(-0.4)).toBe(0)
    expect(signOfPush(0.6)).toBe(1)
    expect(signOfPush(-0.6)).toBe(-1)
    expect(signOfPush(0.5)).toBe(1)
  })

  it('reads the side and the drill-down push of a held intent', () => {
    expect(driveSignsOfIntent({ moveX: -1, facing: FACING.down, lift: false })).toEqual({
      x: -1,
      y: -1,
    })
    expect(driveSignsOfIntent({ moveX: 1, facing: FACING.right, lift: false })).toEqual({
      x: 1,
      y: 0,
    })
  })

  it('reads lifting as up, whatever the facing', () => {
    expect(driveSignsOfIntent({ moveX: 0, facing: FACING.up, lift: true })).toEqual({ x: 0, y: 1 })
  })

  it('reports no drive for the idle intent', () => {
    expect(driveSignsOfIntent(IDLE_INTENT)).toEqual({ x: 0, y: 0 })
  })

  it('takes only an x and a y, each -1, 0 or 1', () => {
    expect(isDriveSigns({ x: -1, y: 1 })).toBe(true)
    expect(isDriveSigns({ x: 0.6, y: 0 })).toBe(false)
    expect(isDriveSigns({ x: 2, y: 0 })).toBe(false)
    expect(isDriveSigns({ x: 0 })).toBe(false)
    expect(isDriveSigns({ x: 0, y: 0, z: 0 })).toBe(false)
    expect(isDriveSigns({ x: '1', y: 0 })).toBe(false)
    expect(isDriveSigns([0, 0])).toBe(false)
    expect(isDriveSigns(null)).toBe(false)
  })
})
