import { describe, expect, it } from 'vitest'
import { FACING } from '../vehicle/vehiclePose'
import { chunkOfSample, localSampleOf, sampleIndexOf, SAMPLES_PER_TILE } from '../world/sampleGrid'
import type { TilePoint } from '../world/tileGrid'
import { currentCasingOfChunk } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import {
  createScriptedSession,
  drill,
  mineTile,
  poseAbove,
  surfaceOreTiles,
  typesOf,
  type ScriptedSession,
} from './scriptedSession'

const lineCasing = (x: number, y: number, grade: number) =>
  ({ type: 'debug.lineCasing', payload: { x, y, grade } }) as const

function casingSamplesOf(session: ScriptedSession, tile: TilePoint): number {
  let lined = 0
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      const sx = tile.tx * SAMPLES_PER_TILE + qx
      const sy = tile.ty * SAMPLES_PER_TILE + qy
      const casing = currentCasingOfChunk(
        session.state().world,
        chunkOfSample(sx),
        chunkOfSample(sy),
      )
      if (casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))] > 0) lined++
    }
  }
  return lined
}

const LEFT = { tx: -1, ty: 0 }

/**
 * An ore cell with its left neighbour mined out, so its left column of samples is a wall; at
 * `grade` a ring round a point 0.95 m left of that column lines the wall (0 leaves it unlined).
 */
function oreWall(grade: number): {
  session: ScriptedSession
  ore: TilePoint
  events: DomainEvent[]
} {
  const session = createScriptedSession()
  const [ore] = surfaceOreTiles(1)
  mineTile(session, 10, { tx: ore.tx + LEFT.tx, ty: ore.ty + LEFT.ty })
  const events =
    grade === 0
      ? []
      : session.submit(60, lineCasing(ore.tx * 1000 - 950, ore.ty * 1000 + 375, grade))
  return { session, ore, events }
}

/** Drills the ore cell from above until it breaks; the events of that one command. */
function drillOre(session: ScriptedSession, ore: TilePoint): DomainEvent[] {
  session.submit(61, poseAbove(ore, FACING.down))
  return session.submit(400, drill(ore, 300))
}

const ticksOf = (events: readonly DomainEvent[]) =>
  events.reduce((ticks, event) => ticks + (event.type === 'DrillDamageDealt' ? event.ticks : 0), 0)

/** What each `CargoAdded` credited, without where it sits in the log. */
const cargoOf = (events: readonly DomainEvent[]) =>
  events.flatMap((event) =>
    event.type === 'CargoAdded'
      ? [{ resourceTier: event.resourceTier, amount: event.amount, value: event.value }]
      : [],
  )

describe('re-drilling casing', () => {
  it('lines the wall beside a mined hole through debug.lineCasing and logs the ring', () => {
    const { session, ore, events } = oreWall(2)
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'CasingPlaced', grade: 2, relined: 0 }),
    )
    expect(typesOf(events)).toContain('GroundChanged')
    expect(typesOf(events).at(-1)).toBe('DebugCommandApplied')
    expect(casingSamplesOf(session, ore)).toBe(4)
  })

  it('pays the same ore for a lined wall as for an unlined one', () => {
    const unlined = oreWall(0)
    const lined = oreWall(2)
    const unlinedCargo = cargoOf(drillOre(unlined.session, unlined.ore))
    expect(unlinedCargo).toHaveLength(1)
    expect(cargoOf(drillOre(lined.session, lined.ore))).toEqual(unlinedCargo)
    expect(lined.session.vehicle().cargo).toEqual(unlined.session.vehicle().cargo)
  })

  it('charges only the drill energy for the ticks it cut', () => {
    const { session, ore } = oreWall(2)
    const energy = session.vehicle().energy
    const events = drillOre(session, ore)
    expect(ticksOf(events)).toBeGreaterThan(0)
    expect(energy - session.vehicle().energy).toBe(ticksOf(events) * 4)
  })

  it('logs the lining it cleared and leaves the cell unlined', () => {
    const { session, ore } = oreWall(2)
    const events = drillOre(session, ore)
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'CasingDrilled', samples: 4, grade: 2 }),
    )
    expect(casingSamplesOf(session, ore)).toBe(0)
  })

  it('takes longer to drill higher-grade lining, as band-G rock', () => {
    const drillTicksAtGrade = (grade: number) => {
      const { session, ore } = oreWall(grade)
      return ticksOf(drillOre(session, ore))
    }
    expect(drillTicksAtGrade(1)).toBeLessThan(drillTicksAtGrade(3))
  })
})
