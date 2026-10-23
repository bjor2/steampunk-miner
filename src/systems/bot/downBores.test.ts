import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { BASE_GRAVITY, TICKS_PER_SECOND } from '../../constants/physics'
import { createAuthorityState } from '../authority/authorityState'
import { FREEZE_ENEMIES, GROUND } from '../authority/scriptedSession'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import type { TilePoint } from '../world/tileGrid'
import { openTile } from './botDig'
import { moveStraight } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { botPlanetOf } from './botTravel'
import {
  descentLegOf,
  effectiveDownSpeedOf,
  entrySpeedOf,
  gravityBoundShareOf,
  newDownBoreTally,
  rampedDownBoreOf,
  rampRestTicksOf,
  tallyDownBore,
} from './downBores'

// Bjor's ruling on #724 in the pacing bot: a bore down takes the longer of the drill's time and
// the time local gravity lets the body gain the drill's speed across the metre; the speed carries
// down a leg, and each planet tallies its effective down speed.

const QUANTUM = DRILL_SUBSTEPS_PER_TICK
const G = BASE_GRAVITY
/** 60 sub-steps of 60: a drill that cuts a metre a tick, 60 m/s. */
const FAST = { subSteps: 60, quantum: QUANTUM }
/** 3600 sub-steps: a metre a second. */
const SLOW = { subSteps: 3600, quantum: QUANTUM }

const subStepsOfSeconds = (seconds: number) => Math.ceil(seconds * TICKS_PER_SECOND * QUANTUM)

describe('bores down under the gravity ramp (#724)', () => {
  it('takes the ramp from rest across the metre where the drill is faster', () => {
    const ramped = rampedDownBoreOf(FAST, 0, G)
    const seconds = Math.sqrt(2 / G)
    expect(ramped.bore).toEqual({ subSteps: subStepsOfSeconds(seconds), quantum: QUANTUM })
    expect(ramped.exitSpeed).toBeCloseTo(G * seconds, 12)
  })

  it("keeps the drill's time where the ramp reaches its speed early in the metre", () => {
    const ramped = rampedDownBoreOf(SLOW, 0, G)
    const rampSeconds = 1 / G
    const seconds = rampSeconds + (1 - rampSeconds / 2) / 1
    expect(ramped.bore.subSteps).toBe(Math.max(SLOW.subSteps, subStepsOfSeconds(seconds)))
    expect(ramped.exitSpeed).toBe(1)
  })

  it("brakes at once: a leg already past the drill's speed takes the drill's time", () => {
    const ramped = rampedDownBoreOf(SLOW, 30, G)
    expect(ramped.bore).toEqual(SLOW)
    expect(ramped.exitSpeed).toBe(1)
  })

  it('is slower under weaker gravity, and the core floor still moves it', () => {
    const planet1 = rampedDownBoreOf(FAST, 0, G).bore.subSteps
    const planet2 = rampedDownBoreOf(FAST, 0, G * 1.25).bore.subSteps
    const lowG = rampedDownBoreOf(FAST, 0, G * 0.5).bore.subSteps
    const coreFloor = rampedDownBoreOf(FAST, 0, G * 0.1)
    expect(planet2).toBeLessThan(planet1)
    expect(lowG).toBeGreaterThan(planet1)
    expect(coreFloor.bore.subSteps).toBe(subStepsOfSeconds(Math.sqrt(2 / (G * 0.1))))
    expect(coreFloor.exitSpeed).toBeGreaterThan(0)
  })

  it("stands by only for the ramp's ticks past the drill's own, never below none", () => {
    const ramped = { subSteps: 1500, quantum: QUANTUM }
    expect(rampRestTicksOf(ramped, FAST, 2)).toBe(23)
    expect(rampRestTicksOf(ramped, FAST, 25)).toBe(0)
    expect(rampRestTicksOf(ramped, FAST, 30)).toBe(0)
  })

  it("owes only the ramp's ticks past the drill's when the cell opens before the drill is done", () => {
    const drill = { subSteps: 1200, quantum: QUANTUM }
    const ramped = { subSteps: 1500, quantum: QUANTUM }
    expect(rampRestTicksOf(ramped, drill, 12)).toBe(5)
    expect(rampRestTicksOf(ramped, drill, 20)).toBe(5)
    expect(rampRestTicksOf(ramped, drill, 22)).toBe(3)
  })

  it('carries the leg speed only into a bore from the tile it opened, on the tick it ended', () => {
    const leg = { tick: 40, tile: { tx: 3, ty: 9 }, speed: 7 }
    expect(entrySpeedOf(leg, { tx: 3, ty: 9 }, 40)).toBe(7)
    expect(entrySpeedOf(leg, { tx: 3, ty: 9 }, 41)).toBe(0)
    expect(entrySpeedOf(leg, { tx: 4, ty: 9 }, 40)).toBe(0)
    expect(entrySpeedOf(undefined, { tx: 3, ty: 9 }, 40)).toBe(0)
  })

  it('leaves a move down at its travel speed in the tile it reached, and any other move at none', () => {
    const top = { tx: 3, ty: 9 }
    const below = { tx: 3, ty: 5 }
    expect(descentLegOf(top, below, 40, 8)).toEqual({ tick: 40, tile: below, speed: 8 })
    expect(descentLegOf(below, top, 40, 8)).toBeUndefined()
    expect(descentLegOf(top, { tx: 6, ty: 9 }, 40, 8)).toBeUndefined()
    expect(descentLegOf(top, top, 40, 8)).toBeUndefined()
  })

  it('tallies metres, ticks and the ramp share, and reads the effective down speed', () => {
    const tally = newDownBoreTally()
    tallyDownBore(tally, 2, SLOW, SLOW)
    tallyDownBore(tally, 2, FAST, { subSteps: 300, quantum: QUANTUM })
    const record = tally.get(2)
    expect(record).toEqual({ planet: 2, metres: 2, boreTicks: 65, gravityBoundTicks: 4 })
    expect(record === undefined ? 0 : effectiveDownSpeedOf(record)).toBeCloseTo(120 / 65, 12)
    expect(record === undefined ? 0 : gravityBoundShareOf(record)).toBeCloseTo(4 / 65, 12)
  })
})

/** Drill power purchase 32: band-1 rock far faster than gravity lets a body gain speed. */
const FAST_DRILL = 32
const SHAFT: readonly TilePoint[] = [0, 1, 2, 3].map((depth) => ({
  tx: GROUND.tx,
  ty: GROUND.ty - depth,
}))

function botWithFastDrill(): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit(FREEZE_ENEMIES)
  session.submit(setUpgradeCommand('drill_power', FAST_DRILL))
  return session
}

describe('the bot boring a shaft down (#724)', () => {
  it('bores a fast shaft at the pace gravity gives from rest, and tallies it', () => {
    const session = botWithFastDrill()
    const planet = botPlanetOf(session, 'never')
    planet.pilot.position = { tx: GROUND.tx, ty: GROUND.ty + 1 }
    const startTick = session.tick()
    for (const tile of SHAFT) expect(openTile(session, planet, tile)).toBe('opened')
    const ticks = session.tick() - startTick
    const fromRestTicks = Math.sqrt((2 * SHAFT.length) / G) * TICKS_PER_SECOND
    expect(ticks).toBeGreaterThanOrEqual(Math.floor(fromRestTicks))
    expect(ticks).toBeLessThanOrEqual(Math.ceil(fromRestTicks) + 2 * SHAFT.length)
    const record = planet.downBores?.get(1)
    expect(record?.metres).toBe(SHAFT.length)
    expect(record === undefined ? 0 : gravityBoundShareOf(record)).toBeGreaterThan(0.5)
  })

  it('bores on below an open shaft at the speed it came down, not from rest', () => {
    const session = botWithFastDrill()
    const planet = botPlanetOf(session, 'never')
    planet.pilot.position = { tx: GROUND.tx, ty: GROUND.ty + 1 }
    for (const tile of SHAFT) openTile(session, planet, tile)
    moveStraight(session, planet, SHAFT[0])
    moveStraight(session, planet, SHAFT[SHAFT.length - 1])
    const startTick = session.tick()
    const below = { tx: GROUND.tx, ty: GROUND.ty - SHAFT.length }
    expect(openTile(session, planet, below)).toBe('opened')
    const fromRestTicks = Math.sqrt(2 / G) * TICKS_PER_SECOND
    expect(session.tick() - startTick).toBeLessThan(Math.floor(fromRestTicks))
  })
})
