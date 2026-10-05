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

/** Mines an ore cell (crediting its ore), then lines the hole's walls from a ring above it. */
function linedOreHole(): { session: ScriptedSession; hole: TilePoint } {
  const session = createScriptedSession()
  const [hole] = surfaceOreTiles(1)
  mineTile(session, 10, hole)
  session.submit(60, lineCasing(hole.tx * 1000 + 500, (hole.ty + 1) * 1000 + 500, 2))
  return { session, hole }
}

const ticksOf = (events: readonly DomainEvent[]) =>
  events.reduce((ticks, event) => ticks + (event.type === 'DrillDamageDealt' ? event.ticks : 0), 0)

describe('re-drilling casing', () => {
  it('lines the walls of a mined hole through debug.lineCasing and logs the ring', () => {
    const session = createScriptedSession()
    const [hole] = surfaceOreTiles(1)
    mineTile(session, 10, hole)
    const events = session.submit(
      60,
      lineCasing(hole.tx * 1000 + 500, (hole.ty + 1) * 1000 + 500, 2),
    )
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'CasingPlaced', grade: 2, relined: 0 }),
    )
    expect(typesOf(events)).toContain('GroundChanged')
    expect(typesOf(events).at(-1)).toBe('DebugCommandApplied')
    expect(casingSamplesOf(session, hole)).toBeGreaterThan(0)
  })

  it('credits no ore and charges only the drill energy for the ticks it cut', () => {
    const { session, hole } = linedOreHole()
    const cargo = session.vehicle().cargo
    const energy = session.vehicle().energy
    session.submit(61, poseAbove(hole, FACING.down))
    const events = session.submit(400, drill(hole, 300))
    expect(typesOf(events)).not.toContain('CargoAdded')
    expect(typesOf(events)).not.toContain('TileDestroyed')
    expect(session.vehicle().cargo).toEqual(cargo)
    expect(ticksOf(events)).toBeGreaterThan(0)
    expect(energy - session.vehicle().energy).toBe(ticksOf(events) * 4)
  })

  it('logs the lining it cleared and leaves the hole unlined', () => {
    const { session, hole } = linedOreHole()
    const lined = casingSamplesOf(session, hole)
    session.submit(61, poseAbove(hole, FACING.down))
    const events = session.submit(400, drill(hole, 300))
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'CasingDrilled', samples: lined, grade: 2 }),
    )
    expect(casingSamplesOf(session, hole)).toBe(0)
  })

  it('takes longer to drill higher-grade lining, as band-G rock', () => {
    const drillTicksAtGrade = (grade: number) => {
      const session = createScriptedSession()
      const [hole] = surfaceOreTiles(1)
      mineTile(session, 10, hole)
      session.submit(60, lineCasing(hole.tx * 1000 + 500, (hole.ty + 1) * 1000 + 500, grade))
      session.submit(61, poseAbove(hole, FACING.down))
      return ticksOf(session.submit(400, drill(hole, 300)))
    }
    expect(drillTicksAtGrade(1)).toBeLessThan(drillTicksAtGrade(3))
  })
})
