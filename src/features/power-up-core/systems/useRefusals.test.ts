import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../../../systems/economy/economy'
import { GROUND, poseAbove } from '../../../systems/authority/scriptedSession'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import {
  actsOf,
  AIR_DASH_ASK_BP,
  DASHER,
  DASHER_WINDUP_TICKS,
  inMarkedField,
  VERBS,
  type MarkedField,
} from '../fakeMilestoneItems'
import { chargesLeftOf, itemChargesOf, powerUpStateOf } from './chargeState'
import { intentToUseSlot } from './slotUse'

// What a Mark milestone's verb may not do (the GD lock on #256): pass a gate, or the #233 motion
// caps. The fake dasher acts at tick 16 from a press at 10; it is blocked facing down.

const PRESS_TICK = 10
const ACT_TICK = PRESS_TICK + DASHER_WINDUP_TICKS

function chargesAndCooldownOf(field: MarkedField) {
  return {
    chargesLeft: chargesLeftOf(field.state(), 'p1', DASHER),
    readyAtTick: itemChargesOf(powerUpStateOf(field.state(), 'p1'), DASHER).readyAtTick,
  }
}

describe('Mark milestone refusals (#256)', () => {
  it('a milestone verb refused by a gate costs nothing', () => {
    inMarkedField(3, (field) => {
      field.submit(PRESS_TICK, intentToUseSlot('powerup.1'))
      field.advanceTo(ACT_TICK)
      const before = chargesAndCooldownOf(field)
      field.submit(20, poseAbove(GROUND, FACING.down))
      const events = field.submit(22, intentToUseSlot('powerup.1'))
      const blocked = field.advanceTo(22 + DASHER_WINDUP_TICKS)
      expect(events.map((event) => event.type)).not.toContain('CommandRejected')
      expect(blocked.map((event) => event.type)).toEqual(['power-up-core.PowerUpBlocked'])
      expect(chargesAndCooldownOf(field)).toEqual(before)
      expect(actsOf(field.state()).map((act) => act.verb)).toEqual([VERBS[DASHER].plain])
    })
  })

  it('leaves the second tap open after a gate refused it, so a retry in the window fires', () => {
    inMarkedField(3, (field) => {
      field.submit(PRESS_TICK, intentToUseSlot('powerup.1'))
      field.advanceTo(ACT_TICK)
      field.submit(20, poseAbove(GROUND, FACING.down))
      field.submit(22, intentToUseSlot('powerup.1'))
      field.advanceTo(30)
      field.submit(31, poseAbove(GROUND, FACING.right))
      field.submit(32, intentToUseSlot('powerup.1'))
      field.advanceTo(32 + DASHER_WINDUP_TICKS)
      expect(actsOf(field.state()).map((act) => act.verb)).toEqual([
        VERBS[DASHER].plain,
        VERBS[DASHER]['second-tap'],
      ])
    })
  })

  it('an air-dash stays under the liftBp and driveBp caps', () => {
    inMarkedField(3, (field) => {
      field.submit(PRESS_TICK, intentToUseSlot('powerup.1'))
      field.advanceTo(ACT_TICK)
      field.submit(ACT_TICK + 4, intentToUseSlot('powerup.1'))
      const dashTick = ACT_TICK + 4 + DASHER_WINDUP_TICKS
      field.advanceTo(dashTick)
      const capBp = ECONOMY.itemEffectCaps.motionBoostCapBp
      const motion = vehicleMotionAt(field.state(), 'p1', dashTick)
      expect(AIR_DASH_ASK_BP).toBeGreaterThan(capBp)
      expect(motion.burst).not.toBeNull()
      expect({ lift: motion.liftBoostBp, drive: motion.driveBoostBp }).toEqual({
        lift: capBp,
        drive: capBp,
      })
    })
  })
})
