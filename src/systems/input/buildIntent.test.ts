import { describe, expect, it } from 'vitest'
import { dot, fromLocalFrame, localUpOf, tangentOf } from '../vehicle/localFrame'
import { DRIVE_PUSH_STEPS } from '../../constants/physics'
import { AIM } from '../vehicle/aim'
import {
  ACTION_MAP,
  actionsOfChord,
  bindingsWithOverrides,
  defaultBindings,
  type ActionId,
} from './actionMap'
import { buildIntent } from './buildIntent'

const PLANET_POSITIONS = [
  { x: 0, y: 300 },
  { x: 300, y: 0 },
  { x: 0, y: -300 },
  { x: -212, y: 212 },
]

describe('vehicle intent', () => {
  it('takes held actions only, so no camera angle or camera mode can reach it', () => {
    expect(buildIntent.length).toBe(1)
    expect(buildIntent(['aim_right'])).toEqual({
      moveX: DRIVE_PUSH_STEPS,
      aim: AIM.right,
      lift: false,
    })
  })

  it('gives aim_right a tangential push of the same sign at every planet angle', () => {
    const intent = buildIntent(['aim_right'])
    for (const position of PLANET_POSITIONS) {
      const up = localUpOf(position, { x: 0, y: 1 })
      const push = fromLocalFrame(up, intent.moveX / DRIVE_PUSH_STEPS, 0)
      expect(dot(push, tangentOf(up))).toBeCloseTo(1, 9)
      expect(dot(push, up)).toBeCloseTo(0, 9)
    }
  })

  it('aims at the latest pushed facing and keeps nothing when none is held', () => {
    expect(buildIntent(['aim_down', 'aim_right']).aim).toBe(AIM.right)
    expect(buildIntent(['aim_right', 'aim_down']).aim).toBe(AIM.down)
    expect(buildIntent([]).aim).toBeNull()
  })

  it('drives with the side aim pressed last and never with lift or drill down', () => {
    expect(buildIntent(['aim_right', 'aim_left']).moveX).toBe(-DRIVE_PUSH_STEPS)
    expect(buildIntent(['aim_left', 'aim_down']).moveX).toBe(-DRIVE_PUSH_STEPS)
    expect(buildIntent(['lift']).moveX).toBe(0)
  })
})

describe('vehicle intent: W lifts and faces up, S faces down (#40)', () => {
  it('lifts and turns the drill up while lift alone is held', () => {
    expect(buildIntent(['lift'])).toEqual({ moveX: 0, aim: AIM.up, lift: true })
  })

  it('faces down without any lift while drill down alone is held', () => {
    expect(buildIntent(['aim_down'])).toEqual({ moveX: 0, aim: AIM.down, lift: false })
  })

  it('lets the later of lift and drill down win when both are held', () => {
    expect(buildIntent(['lift', 'aim_down'])).toEqual({
      moveX: 0,
      aim: AIM.down,
      lift: false,
    })
    expect(buildIntent(['aim_down', 'lift'])).toEqual({ moveX: 0, aim: AIM.up, lift: true })
  })

  it('climbs with the head on the wall when a side aim follows lift', () => {
    expect(buildIntent(['lift', 'aim_right'])).toEqual({
      moveX: DRIVE_PUSH_STEPS,
      aim: AIM.right,
      lift: true,
    })
    expect(buildIntent(['aim_left', 'lift'])).toEqual({
      moveX: -DRIVE_PUSH_STEPS,
      aim: AIM.up,
      lift: true,
    })
  })

  it('falls back to the key still held when the later one is released', () => {
    const held: ActionId[] = ['lift', 'aim_down']
    expect(buildIntent(held.filter((action) => action !== 'aim_down'))).toEqual(
      buildIntent(['lift']),
    )
    expect(buildIntent(held.filter((action) => action !== 'lift'))).toEqual(
      buildIntent(['aim_down']),
    )
  })

  it('gives the idle intent when nothing is held', () => {
    expect(buildIntent([])).toEqual({ moveX: 0, aim: null, lift: false })
  })
})

describe('vehicle intent: rebinding', () => {
  it('gives a rebound key the intent the default key gave', () => {
    const rebound = bindingsWithOverrides(ACTION_MAP, { aim_left: { keyboard: ['KeyJ'] } })
    const before = buildIntent(
      actionsOfChord(ACTION_MAP, defaultBindings(ACTION_MAP), 'vehicle', 'KeyA'),
    )
    const after = buildIntent(actionsOfChord(ACTION_MAP, rebound.bindings, 'vehicle', 'KeyJ'))
    expect(after).toEqual(before)
    expect(after.moveX).toBe(-DRIVE_PUSH_STEPS)
  })
})

describe('vehicle intent: keys give the analog intent its extremes (ticket 791)', () => {
  it('drives a side key at the full push and aims only at the four facings, as #40 keeps', () => {
    expect(buildIntent(['aim_left']).moveX).toBe(-DRIVE_PUSH_STEPS)
    expect(buildIntent(['lift', 'aim_right']).aim).toBe(AIM.right)
    expect(buildIntent(['aim_down', 'aim_right', 'lift']).aim).toBe(AIM.up)
  })
})
