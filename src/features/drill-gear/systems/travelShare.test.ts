import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../../../systems/authority/authorityCommand'
import { NO_TICKS, reportPoseIntent } from '../../../systems/bot/botPose'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { isTravelKeptByDeep, TRAVEL_SHARE_CAP_BP, travelShareBpOf } from './travelShare'

// The GD ruling on #392: Deep can't push travel above 25% of trip time. Travel is what the pose
// reports charged as drive and thrust, over the run's ticks.

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

  it('keeps Deep under the cap, or no higher than a bare run already over it', () => {
    expect(isTravelKeptByDeep(TRAVEL_SHARE_CAP_BP, 1000)).toBe(true)
    expect(isTravelKeptByDeep(TRAVEL_SHARE_CAP_BP + 1, 1000)).toBe(false)
    expect(isTravelKeptByDeep(3000, 3200)).toBe(true)
    expect(isTravelKeptByDeep(3300, 3200)).toBe(false)
  })
})
