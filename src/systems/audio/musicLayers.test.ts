import { describe, expect, it } from 'vitest'
import {
  easeLayers,
  musicTargetsOf,
  nearestEnemyMetresOf,
  planetTuningOf,
  SILENT_LAYERS,
  type MusicLayers,
  type MusicMoment,
} from './musicLayers'

const surface: MusicMoment = { isDocked: false, depthTiles: 0, nearestEnemyMetres: null }

function fade(from: MusicLayers, to: MusicLayers, seconds: number, fps: number): MusicLayers {
  const layers = { ...from }
  for (let frame = 0; frame < seconds * fps; frame++) easeLayers(layers, to, 1 / fps)
  return layers
}

describe('music layers', () => {
  it('plays only the platform loop while docked', () => {
    expect(musicTargetsOf({ ...surface, isDocked: true })).toEqual({
      ...SILENT_LAYERS,
      platform: 1,
    })
  })

  it('trades the platform loop for the drone underground, with tension rising by depth', () => {
    const shallow = musicTargetsOf({ ...surface, depthTiles: 10 })
    const deep = musicTargetsOf({ ...surface, depthTiles: 100 })
    expect(shallow).toMatchObject({ platform: 0, ambience: 1 })
    expect(deep.tension).toBeGreaterThan(shallow.tension)
    expect(musicTargetsOf({ ...surface, depthTiles: 10_000 }).tension).toBe(1)
  })

  it('brings the combat layer in as an enemy closes, and drops it with none near', () => {
    const far = musicTargetsOf({ ...surface, depthTiles: 40, nearestEnemyMetres: 10 })
    const near = musicTargetsOf({ ...surface, depthTiles: 40, nearestEnemyMetres: 2 })
    expect(near.combat).toBeGreaterThan(far.combat)
    expect(musicTargetsOf({ ...surface, depthTiles: 40, nearestEnemyMetres: 50 }).combat).toBe(0)
  })

  it('crossfades the same at 30 and 144 frames/s', () => {
    const docked = musicTargetsOf({ ...surface, isDocked: true })
    const deep = musicTargetsOf({ ...surface, depthTiles: 60 })
    const at30 = fade(docked, deep, 1, 30)
    const at144 = fade(docked, deep, 1, 144)
    expect(at30.platform).toBeCloseTo(at144.platform, 6)
    expect(at30.platform).toBeGreaterThan(0)
    expect(at30.platform).toBeLessThan(1)
  })

  it('measures the nearest enemy in metres, or none with no enemy', () => {
    const at = (x: number, y: number) =>
      ({ x: x * 1000, y: y * 1000 }) as Parameters<typeof nearestEnemyMetresOf>[0][number]
    expect(nearestEnemyMetresOf([], 0, 0)).toBeNull()
    expect(nearestEnemyMetresOf([at(10, 0), at(3, 4)], 0, 0)).toBe(5)
  })

  it('tunes planet 2 differently from planet 1', () => {
    expect(planetTuningOf(1)).toBe(0)
    expect(planetTuningOf(2)).not.toBe(0)
  })
})
