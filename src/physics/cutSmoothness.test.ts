import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { createRig } from './cutFollowFixtures'

// Continuous cut-follow (K-bound, ticket 400, from the #397 TD lock): once a cut has ramped up the
// body holds the drill's speed across cell boundaries, its speed varying by at most 5% there, and
// it never ends a tick inside solid ground. The fixed step runs under render frames at 30 and at
// 144 frames a second, which must step the rig the same.
//
// With no tile floor (ticket 397) the fast rigs are named by their cut speed on planet 1 (GD and TD
// rulings on #397, Q2). The 5% line waits on others: on the 15, 25 and 44 m/s rigs every boundary
// over 5% goes with the carry holding its target cell out of the stamp, a lip at the body's lower
// front (#421, level, down and up); the 78 m/s and 3600 m/s rigs meet a bore narrower than the body
// on a fresh path (#439), and a 3 s leg at 300 m/s needs a planet larger than planet 1.

const RIGS: Readonly<Record<string, Record<string, number>>> = {
  '15 m/s': { drill_power: 200, drill_tip: 600, engine: 5000 },
  '25 m/s': { drill_power: 250, drill_tip: 600, engine: 5000 },
  '44 m/s (rig 1, #400)': { drill_power: 300, drill_tip: 200 },
}
const FRAME_RATES = [30, 144]

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

/** Off the pad, down a shaft, then a level tunnel west, at `framesPerSecond` render frames. */
function playScript(levels: Record<string, number>, framesPerSecond: number) {
  const rig = createRig(RAPIER, levels, framesPerSecond)
  const ticks = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  rig.hold(buildIntent(['aim_left']), ticks(2))
  const down = rig.hold(buildIntent(['aim_down']), ticks(3))
  return { down, level: rig.hold(buildIntent(['aim_left']), ticks(3)) }
}

describe('continuous cut-follow (tickets 400, 397)', () => {
  it.todo(
    'the 15, 25 and 44 m/s rigs vary their speed by at most 5% across cell boundaries down, at 30 and 144 frames/s (#421: the carry target-cell lip)',
  )

  it.todo(
    'the 15, 25 and 44 m/s rigs vary their speed by at most 5% across cell boundaries up, at 30 and 144 frames/s (#421: the carry target-cell lip)',
  )

  it.todo(
    'varies its speed by at most 5% across cell boundaries in a level cut (#421: the carry target-cell lip)',
  )

  it.todo(
    'the 78 m/s and 3600 m/s rigs and a 300 m/s rig on a large planet vary their speed by at most 5% across cell boundaries, and never end a tick inside solid ground (#439: the swept carve clears a body-wide bore at any cells a tick)',
  )

  it.each(Object.keys(RIGS).map((rig) => [rig] as const))(
    '%s rig: never ends a tick inside solid ground, and steps alike at 30 and 144 frames/s',
    (rig) => {
      const paths = FRAME_RATES.map((framesPerSecond) => {
        const run = playScript(RIGS[rig], framesPerSecond)
        const ticks = [...run.down, ...run.level]
        expect(ticks.filter((tick) => tick.isInsideGround)).toEqual([])
        return ticks.map(({ position }) => position)
      })
      expect(paths[0]).toEqual(paths[1])
    },
    120_000,
  )
})
