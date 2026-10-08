import { describe, expect, it } from 'vitest'
import { MAX_SPEED_MM_PER_SECOND } from '../../../../constants/balance'
import { MM_PER_METRE } from '../../../../constants/physics'
import { PACING_WORLD_SEEDS } from '../../../../constants/pacingSeeds'
import { planetParamsFor, type PlanetParams } from '../../../../systems/world/planetParams'
import { CHUNK_SIZE } from '../../../../systems/world/tileGrid'
import { magneticFieldsInBox } from '../magneticFields'
import { FIELD_ARC_CAP } from './fieldArcBudget'
import {
  createFieldArcBuffer,
  refreshFieldArcs,
  writeLookaheadWindow,
  type FieldArcBuffer,
  type FieldArcPose,
} from './fieldArcBuffer'
import { apexOf, fieldArcsNearest } from './fieldArcs'

const SEED = PACING_WORLD_SEEDS['bot-slice'][0]
/** Endless Lodestone: magnetic, and past P40, at the top speed the ruling's gate names. */
const MAGNETIC_PLANET = 43
const RELIC_PLANET = 30
const TOP_SPEED_M_PER_S = MAX_SPEED_MM_PER_SECOND / MM_PER_METRE

/** A pose standing on the planet's surface over its centre, `depthM` down. */
function poseDown(params: PlanetParams, depthM: number, vy = 0): FieldArcPose {
  return { x: 0.5, y: params.radiusTiles - depthM, vx: 0, vy }
}

/** A pose at the first ferrous vein down the centre column. */
function poseAtVein(params: PlanetParams): FieldArcPose {
  const box = { x0: -8, y0: 0, x1: 8, y1: params.radiusTiles }
  const veins = magneticFieldsInBox(params, box).sort((a, b) => b.vein.ty - a.vein.ty)
  return { x: veins[0].vein.tx + 0.5, y: veins[0].vein.ty + 0.5, vx: 0, vy: 0 }
}

/** Drives the rig down the centre column at `speed` m/s, refreshing once a frame. */
function descend(buffer: FieldArcBuffer, params: PlanetParams, seconds: number, fps: number) {
  const frames = seconds * fps
  let rewrites = 0
  for (let frame = 0; frame < frames; frame++) {
    const pose = poseDown(params, 30 + (TOP_SPEED_M_PER_S * frame) / fps, -TOP_SPEED_M_PER_S)
    if (refreshFieldArcs(buffer, params, pose)) rewrites += 1
  }
  return rewrites
}

describe('field arc buffer', () => {
  it('draws arcs round a magnetic planet’s veins and none on the relic planet', () => {
    const magnetic = planetParamsFor(SEED, MAGNETIC_PLANET)
    const relic = planetParamsFor(SEED, RELIC_PLANET)
    const onMagnetic = createFieldArcBuffer()
    const onRelic = createFieldArcBuffer()
    refreshFieldArcs(onMagnetic, magnetic, poseAtVein(magnetic))
    refreshFieldArcs(onRelic, relic, poseDown(relic, 40))
    expect(onMagnetic.arcCount).toBeGreaterThan(0)
    expect(onMagnetic.arcCount).toBeLessThanOrEqual(FIELD_ARC_CAP)
    expect(onRelic.arcCount).toBe(0)
  })

  it('keeps one buffer at P40+ top speed, rewriting it only as the window reaches new chunks', () => {
    const params = planetParamsFor(SEED, MAGNETIC_PLANET)
    const buffer = createFieldArcBuffer()
    const { positions, dash } = buffer
    const seconds = 20
    const rewrites = descend(buffer, params, seconds, 60)
    const chunksCrossed = Math.ceil((TOP_SPEED_M_PER_S * seconds) / CHUNK_SIZE)
    expect(buffer.positions).toBe(positions)
    expect(buffer.dash).toBe(dash)
    expect(rewrites).toBeGreaterThan(1)
    expect(rewrites).toBeLessThanOrEqual(chunksCrossed + 2)
  })

  it('rewrites as often at 30 and at 144 frames a second', () => {
    const params = planetParamsFor(SEED, MAGNETIC_PLANET)
    expect(descend(createFieldArcBuffer(), params, 10, 30)).toBe(
      descend(createFieldArcBuffer(), params, 10, 144),
    )
  })

  it('picks again on another planet, even from the same window', () => {
    const buffer = createFieldArcBuffer()
    const magnetic = planetParamsFor(SEED, MAGNETIC_PLANET)
    const pose = poseAtVein(magnetic)
    expect(refreshFieldArcs(buffer, magnetic, pose)).toBe(true)
    expect(refreshFieldArcs(buffer, magnetic, pose)).toBe(false)
    expect(refreshFieldArcs(buffer, planetParamsFor(SEED + 1, MAGNETIC_PLANET), pose)).toBe(true)
  })

  it('reaches the whole chunks of the widest view now and where 2 s of speed carries the rig', () => {
    const still = writeLookaheadWindow(
      { x: 16, y: 16, vx: 0, vy: 0 },
      { x0: 0, y0: 0, x1: 0, y1: 0 },
    )
    const moving = writeLookaheadWindow({ x: 16, y: 16, vx: 0, vy: -16 }, { ...still })
    expect(still).toEqual({ x0: -32, y0: -32, x1: 63, y1: 63 })
    expect(moving).toEqual({ x0: -32, y0: -64, x1: 63, y1: 63 })
  })

  it('writes each arc as a dashed curve from its start to its end through its middle', () => {
    const params = planetParamsFor(SEED, MAGNETIC_PLANET)
    const pose = poseAtVein(params)
    const buffer = createFieldArcBuffer()
    refreshFieldArcs(buffer, params, pose)
    const [nearest] = fieldArcsNearest(magneticFieldsInBox(params, buffer.window), pose, 1)
    const segments = buffer.segmentsPerArc
    const middle = (segments / 2) * 2
    expect(buffer.positions[0]).toBeCloseTo(nearest.from.x, 3)
    expect(buffer.positions[middle * 3]).toBeCloseTo(apexOf(nearest).x, 3)
    expect(buffer.positions[middle * 3 + 1]).toBeCloseTo(apexOf(nearest).y, 3)
    expect(buffer.positions[(segments * 2 - 1) * 3 + 1]).toBeCloseTo(nearest.to.y, 3)
    expect(buffer.dash[1]).toBe(0)
    expect(buffer.dash[(segments * 2 - 1) * 2 + 1]).toBe(1)
    expect(buffer.dash[(segments * 2 - 1) * 2]).toBeGreaterThan(0)
  })
})
