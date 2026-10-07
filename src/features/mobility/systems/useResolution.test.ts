import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { WORLD_SEED } from '../../../systems/authority/scriptedSession'
import { replayRun } from '../../../systems/replay/replayRun'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'
import { intentToHoldSlot } from '../../power-up-core'
import {
  CAVITY,
  press,
  recordedSessionWith,
  standInCavity,
  type RecordedSession,
} from '../mobilityTestSession'
import { MOBILITY_ITEM, type MobilityItemId } from './itemIds'
import { mobilityOf } from './mobilitySection'

// Mark milestones of the mobility items (the GD lock on #256, ticket 275), one case per item: the
// item is pressed at tick 10, and the new verb's input comes after it acts (a second press 20
// ticks later, or for a toggle the slot held the tick after). At Mark 3 that input plays the verb;
// at Mark 2 the same input does the old thing. A Mark comes every 3 planets from the item's unlock
// planet, so Mark 2 is researched through unlock + 3 and Mark 3 through unlock + 6. Each run is
// replayed at 30 and 144 steps/s and must read the same.

const PRESS_TICK = 10
const WINDUP_TICKS = 6
const SECOND_TAP_AFTER = 20

interface MilestoneCase {
  itemId: MobilityItemId
  unlockPlanet: number
  facing: Facing
  isInCavity?: boolean
  /** A toggle's Mark 3 is its hold; every other item's is a second tap. */
  isToggle?: boolean
  /** What the spec reads of the verb once the input has acted. */
  observe(state: AuthorityState, tick: number): unknown
}

interface MilestoneRun {
  observed: unknown
  replayed: unknown[]
}

/** The item used, then the Mark 3 input, with every node through `planetIndex` researched. */
function runAt(item: MilestoneCase, planetIndex: number): MilestoneRun {
  const session = recordedSessionWith({ 'powerup.1': item.itemId }, item.facing)
  session.submit(2, researchThrough(planetIndex))
  if (item.isInCavity) standInCavity(session, 3, item.facing)
  const endTick = pressThenFollow(session, item)
  return {
    observed: item.observe(session.state(), endTick),
    replayed: [30, 144].map((framesPerSecond) => {
      const replay = replayRun(WORLD_SEED, session.commands, { endTick, framesPerSecond })
      return item.observe(replay.state, endTick)
    }),
  }
}

/** Press, then the follow-up input once the use has acted; the tick after the follow-up acts. */
function pressThenFollow(session: RecordedSession, item: MilestoneCase): number {
  const windup = item.isToggle ? 0 : WINDUP_TICKS
  const actTick = PRESS_TICK + windup
  session.submit(PRESS_TICK, press())
  session.advanceTo(actTick)
  const inputTick = item.isToggle ? actTick + 1 : actTick + SECOND_TAP_AFTER
  session.submit(inputTick, item.isToggle ? intentToHoldSlot('powerup.1') : press())
  const endTick = inputTick + windup + 1
  session.advanceTo(endTick)
  return endTick
}

function researchThrough(planetIndex: number): CommandIntent {
  return { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } } as CommandIntent
}

const mobility = (state: AuthorityState) => mobilityOf(state, 'p1')
const motion = (state: AuthorityState, tick: number) => vehicleMotionAt(state, 'p1', tick)
const burstOf = (state: AuthorityState, tick: number) => motion(state, tick).burst

/** The squared distance from the cavity's centre to the tile the grapple hooked. */
function hookDistanceSqOf(state: AuthorityState): number | null {
  const reel = mobility(state).reel
  if (reel === null) return null
  const dx = reel.hookTx * 1000 + 500 - CAVITY.x
  const dy = reel.hookTy * 1000 + 500 - CAVITY.y
  return dx * dx + dy * dy
}

/**
 * Each case's verb at Mark 3 (`verb`) against what the same input does at Mark 2 (`old`), read
 * from what `observe` returns.
 */
/** The second shot hooks farther off than the first; at Mark 2 it waits out the cooldown. */
const GRAPPLE_CASE: MilestoneCase = {
  itemId: MOBILITY_ITEM.grappleWinch,
  unlockPlanet: 3,
  facing: FACING.up,
  isInCavity: true,
  observe: (state) => hookDistanceSqOf(state),
}

/**
 * Each other item's verb at Mark 3 (`verb`) against what the same input does at Mark 2 (`old`),
 * read from what `observe` returns.
 */
const CASES: readonly (MilestoneCase & { verb: unknown; old: unknown; name: string })[] = [
  {
    name: 'the ballast drop kicks the miner up a hop',
    itemId: MOBILITY_ITEM.emergencyBallast,
    unlockPlanet: 5,
    facing: FACING.right,
    observe: (state, tick) => ({ kick: burstOf(state, tick) !== null }),
    verb: { kick: true },
    old: { kick: false },
  },
  {
    name: 'the heat sink flask jets the miner the way it faces',
    itemId: MOBILITY_ITEM.heatSinkFlask,
    unlockPlanet: 9,
    facing: FACING.right,
    observe: (state, tick) => ({ jetsRight: (burstOf(state, tick)?.x ?? 0) > 0 }),
    verb: { jetsRight: true },
    old: { jetsRight: false },
  },
  {
    name: 'the steam boost air-dashes sideways',
    itemId: MOBILITY_ITEM.steamBoost,
    unlockPlanet: 12,
    facing: FACING.up,
    observe: (state) => {
      const boost = mobility(state).boost
      return { isSideways: boost !== null && boost.dirX !== 0 && boost.dirY === 0 }
    },
    verb: { isSideways: true },
    old: { isSideways: false },
  },
  {
    name: 'the rivet patch puts a second plate on the same hold',
    itemId: MOBILITY_ITEM.rivetPatch,
    unlockPlanet: 16,
    facing: FACING.right,
    observe: (state) => ({ plates: mobility(state).patch?.plates ?? 1 }),
    verb: { plates: 2 },
    old: { plates: 1 },
  },
  {
    name: 'the steam shield raises a cooling curtain',
    itemId: MOBILITY_ITEM.steamShield,
    unlockPlanet: 22,
    facing: FACING.right,
    observe: (state) => ({ coolingWindows: mobility(state).heatSinks.length }),
    verb: { coolingWindows: 1 },
    old: { coolingWindows: 0 },
  },
  {
    name: 'the smoke canister is thrown ahead',
    itemId: MOBILITY_ITEM.smokeCanister,
    unlockPlanet: 27,
    facing: FACING.right,
    observe: (state) => {
      const smoke = mobility(state).smoke
      const pose = state.players.p1.vehicle.pose
      return { aheadMm: smoke === null || pose === null ? null : smoke.x - pose.x }
    },
    verb: { aheadMm: 6000 },
    old: { aheadMm: 0 },
  },
  {
    name: 'the grav anchor pins the miner in open air',
    itemId: MOBILITY_ITEM.gravAnchor,
    unlockPlanet: 32,
    facing: FACING.right,
    isToggle: true,
    observe: (state, tick) => ({ isHovering: motion(state, tick).isHovering }),
    verb: { isHovering: true },
    old: { isHovering: false },
  },
  {
    name: 'the buoyancy tanks rise fast',
    itemId: MOBILITY_ITEM.buoyancyTanks,
    unlockPlanet: 34,
    facing: FACING.right,
    isToggle: true,
    observe: (state, tick) => ({ liftBoostBp: motion(state, tick).liftBoostBp }),
    verb: { liftBoostBp: 2000 },
    old: { liftBoostBp: 0 },
  },
  {
    name: 'the escape thruster fires the way the miner faces',
    itemId: MOBILITY_ITEM.escapeThruster,
    unlockPlanet: 37,
    facing: FACING.right,
    isInCavity: true,
    observe: (state) => ({ facing: mobility(state).escape?.facing ?? 'up' }),
    verb: { facing: FACING.right },
    old: { facing: 'up' },
  },
]

describe('mobility Mark milestones: the Mark 3 verb of each item (#256)', () => {
  it.each(CASES)(
    'at M3 the input fires the new verb and at M2 the same input does the old thing: $name',
    (item) => {
      const atMark3 = runAt(item, item.unlockPlanet + 6)
      const atMark2 = runAt(item, item.unlockPlanet + 3)
      expect(atMark3.observed).toEqual(item.verb)
      expect(atMark2.observed).toEqual(item.old)
      expect(atMark3.replayed).toEqual([item.verb, item.verb])
      expect(atMark2.replayed).toEqual([item.old, item.old])
    },
  )

  it('at M3 the input fires the new verb and at M2 the same input does the old thing: the grapple fires again at the next anchor', () => {
    const atMark3 = runAt(GRAPPLE_CASE, GRAPPLE_CASE.unlockPlanet + 6)
    const atMark2 = runAt(GRAPPLE_CASE, GRAPPLE_CASE.unlockPlanet + 3)
    expect(atMark2.observed).not.toBeNull()
    expect(atMark3.observed as number).toBeGreaterThan(atMark2.observed as number)
    expect(atMark3.replayed).toEqual([atMark3.observed, atMark3.observed])
    expect(atMark2.replayed).toEqual([atMark2.observed, atMark2.observed])
  })
})
