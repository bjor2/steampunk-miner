import { describe, expect, it } from 'vitest'
import { DRIVE_PUSH_STEPS } from '../../constants/physics'
import { driveSignsOfIntent, isDriveSigns, signOfPush } from './driveSigns'
import { IDLE_INTENT } from './vehicleIntent'
import { AIM } from './aim'

describe('drive signs', () => {
  it('counts a side push only from halfway, so 0.4 drives straight and 0.6 to that side', () => {
    expect(signOfPush(0.4)).toBe(0)
    expect(signOfPush(-0.4)).toBe(0)
    expect(signOfPush(0.6)).toBe(1)
    expect(signOfPush(-0.6)).toBe(-1)
    expect(signOfPush(0.5)).toBe(1)
  })

  it('reads the side and the drill-down push of a held intent', () => {
    expect(driveSignsOfIntent({ moveX: -DRIVE_PUSH_STEPS, aim: AIM.down, lift: false })).toEqual({
      x: -1,
      y: -1,
    })
    expect(driveSignsOfIntent({ moveX: DRIVE_PUSH_STEPS, aim: AIM.right, lift: false })).toEqual({
      x: 1,
      y: 0,
    })
  })

  it('reads lifting as up, whatever the aim', () => {
    expect(driveSignsOfIntent({ moveX: 0, aim: AIM.up, lift: true })).toEqual({ x: 0, y: 1 })
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
