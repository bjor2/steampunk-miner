import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState, vehicleOf, withVehicle } from '../authority/authorityState'
import { heatThrottledDrill } from '../authority/heatRules'
import { startToolActing, stopToolActing } from '../authority/hazards/toolActing'
import { ECONOMY } from '../economy/economy'
import { cmp, div, fromSafeInteger, mul } from '../money'
import { withToolActing } from '../vehicle/actingTools'
import { PLAIN_MOTION } from '../vehicle/motionEffects'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { digScaleBpOf, toolTradeOffProblems, type ToolTradeOff } from './toolTradeOffs'
import { vehicleMotionAt } from './vehicleMotionEffects'

// The tool trade-off seam (ticket 848; the GD lock on #823 Q2 as amended, the TD's seam 6388823846
// as amended, the VS's final rows): a penalty on one owned track only while the tool acts, floored
// per row and never below the kernel's 7000 bp, one per axis. Fake slices register the VS's rows.

const PLOUGH: ToolTradeOff = { id: 'kit.plough', axis: 'thrust', penaltyBp: -1000, floorBp: 9000 }
const VANE: ToolTradeOff = { id: 'kit.vane', axis: 'horizontal', penaltyBp: -3000, floorBp: 7000 }
const TONGS: ToolTradeOff = { id: 'kit.tongs', axis: 'dig', penaltyBp: -2500, floorBp: 7500 }
const FLOOR_MIN = ECONOMY.itemEffectCaps.toolFloorMinBp
const PLAYER = 'p1'

function kitSlice(rows: readonly ToolTradeOff[]): SliceDefinition {
  return { id: 'kit', register: (r) => rows.forEach((row) => r.toolTradeOff(row)) }
}

function stateActing(toolIds: readonly string[]) {
  const state = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const vehicle = toolIds.reduce(withToolActing, vehicleOf(state, PLAYER))
  return withVehicle(state, PLAYER, vehicle)
}

function withKit<T>(rows: readonly ToolTradeOff[], run: () => T): T {
  return withRegistrations([kitSlice(rows)], run)
}

describe('tool trade-offs', () => {
  it('reads the kernel minimum floor of 7000 bp from economy.json', () => {
    expect(FLOOR_MIN).toBe(7000)
  })

  it('accepts the VS rows: plough thrust, vane horizontal, tongs dig', () => {
    expect(toolTradeOffProblems([PLOUGH, VANE, TONGS], FLOOR_MIN)).toEqual([])
  })

  it('refuses a floor under the kernel minimum, a boost and a second penalty on an axis, every row listed', () => {
    const low = { ...VANE, id: 'kit.low', floorBp: 6999 }
    const boost = { ...PLOUGH, id: 'kit.boost', axis: 'dig' as const, penaltyBp: 500 }
    expect(toolTradeOffProblems([PLOUGH, VANE, low, boost], FLOOR_MIN)).toEqual([
      'kit.low.floorBp must be whole, from the kernel minimum 7000 to 10000',
      'kit.boost.penaltyBp must be whole, from -10000 to 0: a trade-off never boosts',
      'kit.vane, kit.low each take a horizontal penalty: at most one per axis',
    ])
  })

  it('refuses the registration at load when a row breaks the guards', () => {
    expect(() => withKit([PLOUGH, { ...PLOUGH, id: 'kit.second' }], () => null)).toThrow(
      /at most one per axis/,
    )
  })

  it('leaves driving byte-identical while every tool sits on the rig without acting', () => {
    withKit([PLOUGH, VANE, TONGS], () => {
      expect(vehicleMotionAt(stateActing([]), PLAYER, 0)).toBe(PLAIN_MOTION)
    })
  })

  it('takes 10% of the lift while the plough acts and 30% of the drive while the vane acts', () => {
    withKit([PLOUGH, VANE, TONGS], () => {
      const motion = vehicleMotionAt(stateActing(['kit.plough', 'kit.vane']), PLAYER, 0)
      expect(motion.liftBoostBp).toBe(-1000)
      expect(motion.driveBoostBp).toBe(-3000)
    })
  })

  it('never lets a penalty take the track under its row floor', () => {
    const deep = { ...PLOUGH, penaltyBp: -5000 }
    withKit([deep], () => {
      expect(vehicleMotionAt(stateActing(['kit.plough']), PLAYER, 0).liftBoostBp).toBe(-1000)
    })
  })

  it('scales the dig only while the tongs act, to 75% of the drill power', () => {
    withKit([TONGS], () => {
      const idle = stateActing([])
      expect(digScaleBpOf(vehicleOf(idle, PLAYER))).toBe(10000)
      const own = statsOfVehicle(vehicleOf(idle, PLAYER)).drillPower
      expect(heatThrottledDrill(1, vehicleOf(idle, PLAYER)).drillPower).toBe(own)
      const holding = vehicleOf(stateActing(['kit.tongs']), PLAYER)
      const slowed = heatThrottledDrill(1, holding).drillPower
      expect(cmp(slowed, div(mul(own, fromSafeInteger(3)), fromSafeInteger(4)))).toBe(0)
    })
  })

  it('logs tool_acting once per change and never lingers after release', () => {
    withKit([PLOUGH], () => {
      const state = stateActing([])
      const started = startToolActing(state, PLAYER, 'kit.plough')
      expect(started.events).toEqual([
        { type: 'ToolActingChanged', toolId: 'kit.plough', on: true },
      ])
      expect(startToolActing(started.state, PLAYER, 'kit.plough').events).toEqual([])
      const stopped = stopToolActing(started.state, PLAYER, 'kit.plough')
      expect(stopped.events).toEqual([
        { type: 'ToolActingChanged', toolId: 'kit.plough', on: false },
      ])
      expect(vehicleOf(stopped.state, PLAYER)).toEqual(vehicleOf(state, PLAYER))
      expect(vehicleMotionAt(stopped.state, PLAYER, 0)).toBe(PLAIN_MOTION)
    })
  })
})
