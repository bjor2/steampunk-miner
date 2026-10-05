import { describe, expect, it } from 'vitest'
import { FACING } from '../vehicle/vehiclePose'
import { chunkOfSample, localSampleOf, MM_PER_SAMPLE, sampleIndexOf } from '../world/sampleGrid'
import { currentCasingOfChunk, currentDensityOfChunk } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  GROUND,
  PARAMS,
  poseAbove,
  type ScriptedSession,
} from './scriptedSession'

/** Rock 12 m under the surface east of the pad, where a sideways tunnel is cut. */
const START = { x: 20500, y: 280500 }
const REPORT_TICKS = 12
const STEP_MM = 100

/** A pose report at `x` (y fixed), facing right, with `drillTicks` of drilling since the last. */
function poseAt(x: number, drillTicks: number) {
  const { payload } = poseAbove(GROUND, FACING.right)
  return {
    type: 'reportPose' as const,
    payload: { ...payload, x, y: START.y, drilling: drillTicks > 0, drillTicks },
  }
}

/** Drives through `xs` one report apart, drilling or not, refilling the tank each report. */
function driveThrough(
  session: ScriptedSession,
  firstTick: number,
  xs: readonly number[],
  drillTicks: number,
) {
  xs.forEach((x, index) => {
    const tick = firstTick + index * REPORT_TICKS
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(tick, poseAt(x, drillTicks))
  })
  return firstTick + xs.length * REPORT_TICKS
}

function stepsBetween(fromMm: number, toMm: number): number[] {
  const count = Math.floor(Math.abs(toMm - fromMm) / STEP_MM) + 1
  const direction = toMm >= fromMm ? 1 : -1
  return Array.from({ length: count }, (_, index) => fromMm + direction * index * STEP_MM)
}

const placedOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'CasingPlaced')

/** A 20 m dig to the right from START, then backing out 2.2 m past where it began. */
function digTwentyMetres(): { session: ScriptedSession; digEnd: number } {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  const dug = driveThrough(session, 0, stepsBetween(START.x, START.x + 19900), REPORT_TICKS)
  driveThrough(session, dug, stepsBetween(START.x + 19900, START.x - 2200), 0)
  return { session, digEnd: dug }
}

function linedSamplesOf(session: ScriptedSession): { sx: number; sy: number }[] {
  const lined: { sx: number; sy: number }[] = []
  const y0 = Math.floor((START.y - 2000) / MM_PER_SAMPLE)
  const x0 = Math.floor((START.x - 2000) / MM_PER_SAMPLE)
  for (let sy = y0; sy < y0 + 16; sy++) {
    for (let sx = x0; sx < x0 + 100; sx++) {
      const casing = currentCasingOfChunk(
        session.state().world,
        chunkOfSample(sx),
        chunkOfSample(sy),
      )
      if (casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))] > 0) lined.push({ sx, sy })
    }
  }
  return lined
}

function densityAt(session: ScriptedSession, sx: number, sy: number): number {
  const world = session.state().world
  const density = currentDensityOfChunk(world, PARAMS, chunkOfSample(sx), chunkOfSample(sy))
  return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

describe('automatic casing placement', () => {
  it('lays one ring per half metre of a 20 m dig once the drill has passed each point', () => {
    const { session } = digTwentyMetres()
    const placed = placedOf(session.events())
    expect(placed).toHaveLength(40)
    expect(placed.every((event) => event.grade === 1)).toBe(true)
  })

  it('keeps the rings behind the drill while it digs, so it never re-drills fresh lining', () => {
    const { session, digEnd } = digTwentyMetres()
    const whileDigging = session.events().filter((event) => event.tick < digEnd)
    expect(placedOf(whileDigging).length).toBeGreaterThan(30)
    expect(whileDigging.filter((event) => event.type === 'CasingDrilled')).toEqual([])
  })

  it('lines the rock of the tunnel wall without narrowing the bore', () => {
    const { session } = digTwentyMetres()
    const lined = linedSamplesOf(session)
    expect(lined.length).toBeGreaterThan(0)
    expect(lined.every(({ sx, sy }) => densityAt(session, sx, sy) > 128)).toBe(true)
  })

  it('lays rings at the vehicle casing grade, unlimited and never refused', () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, { type: 'debug.setCasingGrade', payload: { grade: 3 } })
    const dug = driveThrough(session, 0, stepsBetween(START.x, START.x + 9900), REPORT_TICKS)
    driveThrough(session, dug, stepsBetween(START.x + 9900, START.x - 2200), 0)
    const placed = placedOf(session.events())
    expect(placed).toHaveLength(20)
    expect(placed.every((event) => event.grade === 3)).toBe(true)
  })

  it('relines the tunnel at the new grade when the vehicle drills back through it after an upgrade', () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    const dug = driveThrough(session, 0, stepsBetween(START.x, START.x + 9900), REPORT_TICKS)
    const out = driveThrough(session, dug, stepsBetween(START.x + 9900, START.x - 2200), 0)
    session.submit(out, { type: 'debug.setCasingGrade', payload: { grade: 3 } })
    const before = session.events().length
    const back = driveThrough(
      session,
      out,
      stepsBetween(START.x - 2200, START.x + 9900),
      REPORT_TICKS,
    )
    driveThrough(session, back, stepsBetween(START.x + 9900, START.x - 2200), 0)
    const relaid = placedOf(session.events().slice(before))
    expect(relaid.every((event) => event.grade === 3)).toBe(true)
    expect(relaid.reduce((sum, event) => sum + event.relined, 0)).toBeGreaterThan(0)
  })

  it('replays the same dig to the same digest, and a snapshot keeps the trail', () => {
    const first = digTwentyMetres().session.state()
    const again = digTwentyMetres().session.state()
    expect(stateDigest(again)).toBe(stateDigest(first))
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(first))))
    expect('state' in restored && stateDigest(restored.state)).toBe(stateDigest(first))
  })

  it('lays no ring from travel without drilling', () => {
    const session = createScriptedSession()
    driveThrough(session, 0, stepsBetween(START.x, START.x + 9900), 0)
    driveThrough(session, 1500, stepsBetween(START.x + 9900, START.x - 2200), 0)
    expect(placedOf(session.events())).toEqual([])
    expect(session.vehicle().casingTrail.unlined).toEqual([])
  })
})
