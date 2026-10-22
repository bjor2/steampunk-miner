import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { createAuthorityState } from '../authority/authorityState'
import { FREEZE_ENEMIES, GROUND } from '../authority/scriptedSession'
import { driveSpeedOf } from '../vehicle/cutCapSpeed'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { FACING } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import { openTile } from './botDig'
import { createBotSession, type BotSession } from './botSession'
import { botPlanetOf } from './botTravel'
import { tileKindAt } from './botWorld'
import {
  drivenBoreOf,
  driveBoundShareOf,
  newSidewaysBoreTally,
  tallySidewaysBore,
} from './sidewaysBores'

// Bjor's ruling on #723 in the pacing bot: a sideways bore takes at least the drive's time over
// the tile, a bore down or up no drive time, and each planet tallies the share of its level-leg
// bore ticks the drive held.

const QUANTUM = DRILL_SUBSTEPS_PER_TICK
/** A 6 m/s drive takes 600 sub-steps of 60 over a metre: 10 ticks. */
const DRIVE = 6

describe('sideways bores (ticket 723)', () => {
  it("waits the drive's time over a sideways tile the drill would cut faster", () => {
    const bore = { subSteps: 60, quantum: QUANTUM }
    expect(drivenBoreOf(bore, FACING.left, DRIVE)).toEqual({ subSteps: 600, quantum: QUANTUM })
    expect(drivenBoreOf(bore, FACING.right, DRIVE)).toEqual({ subSteps: 600, quantum: QUANTUM })
  })

  it("keeps the drill's time sideways where the drill is slower, and down or up always", () => {
    const slow = { subSteps: 900, quantum: QUANTUM }
    expect(drivenBoreOf(slow, FACING.right, DRIVE)).toEqual(slow)
    const fast = { subSteps: 60, quantum: QUANTUM }
    expect(drivenBoreOf(fast, FACING.down, DRIVE)).toBe(fast)
    expect(drivenBoreOf(fast, FACING.up, DRIVE)).toBe(fast)
  })

  it('tallies the ticks of each sideways bore and the share the drive held, per planet', () => {
    const tally = newSidewaysBoreTally()
    const fast = { subSteps: 60, quantum: QUANTUM }
    const slow = { subSteps: 1800, quantum: QUANTUM }
    tallySidewaysBore(tally, 2, fast, drivenBoreOf(fast, FACING.left, DRIVE))
    tallySidewaysBore(tally, 2, slow, drivenBoreOf(slow, FACING.left, DRIVE))
    const record = tally.get(2)
    expect(record).toEqual({ planet: 2, boreTicks: 40, driveBoundTicks: 10 })
    expect(record === undefined ? null : driveBoundShareOf(record)).toBe(0.25)
  })
})

/** Drill power purchase 32: band-1 rock at about 1300 cells/s, far past the 6 m/s drive. */
const FAST_DRILL = 32
const SHAFT: readonly TilePoint[] = [0, 1, 2].map((depth) => ({
  tx: GROUND.tx,
  ty: GROUND.ty - depth,
}))
const BOTTOM = SHAFT[SHAFT.length - 1]
const LEVEL_LEG: readonly TilePoint[] = [1, 2, 3, 4].map((step) => ({
  tx: BOTTOM.tx + step,
  ty: BOTTOM.ty,
}))

function botWithFastDrill(): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit(FREEZE_ENEMIES)
  session.submit(setUpgradeCommand('drill_power', FAST_DRILL))
  return session
}

/** Opens `tiles` one by one from where the pilot stands; answers the ticks it took. */
function openAll(
  session: BotSession,
  planet: ReturnType<typeof botPlanetOf>,
  tiles: readonly TilePoint[],
) {
  const startTick = session.tick()
  for (const tile of tiles) expect(openTile(session, planet, tile)).toBe('opened')
  return session.tick() - startTick
}

describe('the bot boring a level leg (ticket 723)', () => {
  // The shaft down is ramped by gravity since #724 (`downBores.test.ts`), so only the level leg
  // is timed here.
  it("bores sideways at the drive's pace, tallying the level leg", () => {
    const session = botWithFastDrill()
    const planet = botPlanetOf(session, 'never')
    planet.pilot.position = { tx: GROUND.tx, ty: GROUND.ty + 1 }
    openAll(session, planet, SHAFT)
    const levelTicks = openAll(session, planet, LEVEL_LEG)
    expect(LEVEL_LEG.every((tile) => tileKindAt(session.state(), tile) === 'open')).toBe(true)
    const driveTicksPerTile = TICKS_PER_SECOND / driveSpeedOf(session.vehicle())
    expect(levelTicks).toBeGreaterThanOrEqual(Math.floor(LEVEL_LEG.length * driveTicksPerTile))
    const record = planet.sidewaysBores?.get(1)
    expect(record === undefined ? 0 : driveBoundShareOf(record)).toBe(1)
  })
})
