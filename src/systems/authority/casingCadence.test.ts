import { describe, expect, it } from 'vitest'
import { CASING_RING_SPACING_MM } from '../../constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import { chunkOfSample, localSampleOf, MM_PER_SAMPLE, sampleIndexOf } from '../world/sampleGrid'
import { currentCasingOfChunk } from '../world/worldState'
import { driveThrough, START, stepsBetween } from './casingDigFixtures'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession, FREEZE_ENEMIES, type ScriptedSession } from './scriptedSession'

// Casing at a pose report every tick while the drill bites (#514 scope 6 and Done-when 3, the VS's
// casing lines): a 10 m bore is billed for 10 m of lining at any speed, its wall is lined as fully
// a metre at 1.5, 7 and 15 m/s as 12-tick reports line it at 1.5 m/s (where both cut the same
// bore), and the drill never cuts its own fresh lining. The rig clears every sample its stamp
// reaches, so the bore is open at every speed. A rig cutting back over its own trail is the lane
// `vehicle/casingTrailCadence.lane.test.ts`.

const BORE_MM = 10_000
const SPEEDS_MPS = [1.5, 7, 15]
const CLEARING_RIG = { drill_power: 2000, drill_tip: 600 }
/** The wall read for lining: 2 to 8 m along the bore, 2.5 m either side of its axis. */
const WALL_READ_MM = { from: 2000, to: 8000, across: 2500 }

interface Bore {
  session: ScriptedSession
  /** The events up to the last drilling report. */
  whileDigging: DomainEvent[]
}

/** A 10 m bore east from START at `speedMps`, reported every `interval` ticks, then backed out. */
function boreAt(speedMps: number, interval: number): Bore {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  for (const [upgradeId, level] of Object.entries(CLEARING_RIG)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '100000' } })
  const reportMm = Math.round((speedMps * MM_PER_METRE * interval) / TICKS_PER_SECOND)
  const steps = stepsBetween(START.x, START.x + BORE_MM, reportMm)
  const dug = driveThrough(session, 1, steps, interval, interval)
  const whileDigging = session.events().filter((event) => event.tick < dug)
  driveThrough(session, dug, stepsBetween(START.x + BORE_MM, START.x - 2500), 0)
  return { session, whileDigging }
}

function chargedMmOf({ session }: Bore): number {
  return session
    .events()
    .reduce((sum, event) => (event.type === 'CasingLined' ? sum + event.lengthMm : sum), 0)
}

function linedWallSamplesOf({ session }: Bore): number {
  const world = session.state().world
  const rows = Math.floor((2 * WALL_READ_MM.across) / MM_PER_SAMPLE)
  const y0 = Math.floor((START.y - WALL_READ_MM.across) / MM_PER_SAMPLE)
  const x0 = Math.floor((START.x + WALL_READ_MM.from) / MM_PER_SAMPLE)
  const x1 = Math.floor((START.x + WALL_READ_MM.to) / MM_PER_SAMPLE)
  let lined = 0
  for (let sy = y0; sy < y0 + rows; sy++) {
    for (let sx = x0; sx < x1; sx++) {
      const casing = currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy))
      if (casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))] > 0) lined++
    }
  }
  return lined
}

describe('casing at a report every tick while the drill bites (#514)', () => {
  for (const speedMps of SPEEDS_MPS) {
    it(`bills a 10 m bore for 10 m of lining at ${speedMps} m/s`, () => {
      expect(Math.abs(chargedMmOf(boreAt(speedMps, 1)) - BORE_MM)).toBeLessThanOrEqual(
        CASING_RING_SPACING_MM,
      )
    })

    it(`never drills its own fresh lining while digging at ${speedMps} m/s`, () => {
      const drilled = boreAt(speedMps, 1).whileDigging.filter((e) => e.type === 'CasingDrilled')
      expect(drilled).toEqual([])
    })
  }

  it('lines the wall as fully a metre at 1.5, 7 and 15 m/s as 12-tick reports do at 1.5 m/s', () => {
    const atTwelve = linedWallSamplesOf(boreAt(1.5, 12))
    const everyTick = SPEEDS_MPS.map((speedMps) => linedWallSamplesOf(boreAt(speedMps, 1)))
    expect(atTwelve).toBeGreaterThan(0)
    expect(everyTick).toEqual(SPEEDS_MPS.map(() => atTwelve))
  })
})
