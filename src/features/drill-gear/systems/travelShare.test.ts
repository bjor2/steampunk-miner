import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../../../systems/authority/authorityCommand'
import { NO_TICKS, reportPoseIntent } from '../../../systems/bot/botPose'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { deepTravelOf, TRAVEL_SHARE_CAP_BP, travelShareBpOf } from './travelShare'

// The GD ruling on #392: Deep can't push travel above 25% of trip time. Travel is what the pose
// reports charged as drive and thrust, over the run's ticks. Option (a) of the ruling's Oct 16
// follow-up: Deep is judged only against a bare run that reached the core at or under the cap.

const TILE = { tx: 3, ty: 300 }

function report(playerId: string, ticks: Partial<typeof NO_TICKS>): AuthorityCommand {
  const intent = reportPoseIntent(TILE, FACING.down, { ...NO_TICKS, ...ticks })
  return { ...intent, playerId, tick: 0, seq: 0 } as AuthorityCommand
}

describe('drill-gear fork: travel share of a run (GD ruling on #392)', () => {
  it("sums the player's reported drive and thrust ticks over the run, in basis points", () => {
    const commands = [
      report('p1', { driveTicks: 30 }),
      report('p1', { thrustTicks: 20, drillTicks: 60 }),
      report('p2', { driveTicks: 500 }),
    ]
    expect(travelShareBpOf(commands, 'p1', 1000)).toBe(500)
  })

  it('reads no travel in an empty run', () => {
    expect(travelShareBpOf([], 'p1', 0)).toBe(0)
  })

  it('keeps Deep at or under the cap when the bare run was too', () => {
    expect(deepTravelOf(TRAVEL_SHARE_CAP_BP, 1000)).toBe('kept')
    expect(deepTravelOf(1000, TRAVEL_SHARE_CAP_BP)).toBe('kept')
  })

  it('reads Deep as pushing travel over the cap only from a bare run at or under it', () => {
    expect(deepTravelOf(TRAVEL_SHARE_CAP_BP + 1, 1000)).toBe('pushed_over_cap')
    expect(deepTravelOf(TRAVEL_SHARE_CAP_BP + 1, TRAVEL_SHARE_CAP_BP)).toBe('pushed_over_cap')
  })

  it('leaves Deep ungated when the bare run is already over the cap, however far Deep goes', () => {
    expect(deepTravelOf(4595, 4146)).toBe('bare_over_cap')
    expect(deepTravelOf(1000, TRAVEL_SHARE_CAP_BP + 1)).toBe('bare_over_cap')
  })

  it('measures nothing without a bare share from a run that reached the core', () => {
    expect(deepTravelOf(TRAVEL_SHARE_CAP_BP + 1, null)).toBe('unmeasured')
  })
})
