import { describe, expect, it } from 'vitest'
import type { Enemy } from '../authority/combat/combatState'
import {
  DUCKED_SHARE,
  easeLayers,
  musicBusGainOf,
  musicTargetsOf,
  nearestEnemyMetresOf,
  planetTuningOf,
  SILENT_LAYERS,
  type MusicLayers,
  type MusicMoment,
} from './musicLayers'

const awayFromHub: MusicMoment = {
  isDocked: false,
  dockDistanceMetres: 40,
  depthTiles: 0,
  band: 1,
  isEnergyLow: false,
  nearestEnemyMetres: null,
  isArtefactChoiceOpen: false,
}

const underground = (band: number): MusicMoment => ({ ...awayFromHub, depthTiles: 30, band })

function fade(from: MusicLayers, to: MusicLayers, seconds: number, fps: number): MusicLayers {
  const layers = { ...from }
  for (let frame = 0; frame < seconds * fps; frame++) easeLayers(layers, to, 1 / fps)
  return layers
}

describe('music layers', () => {
  it('plays only the platform loop while docked', () => {
    expect(musicTargetsOf({ ...awayFromHub, isDocked: true, dockDistanceMetres: 0 })).toEqual({
      ...SILENT_LAYERS,
      platform: 1,
    })
  })

  it('keeps the platform loop within 10 m of the hub and lets it go further out', () => {
    expect(musicTargetsOf({ ...awayFromHub, dockDistanceMetres: 9 }).platform).toBe(1)
    expect(musicTargetsOf({ ...awayFromHub, dockDistanceMetres: 10 }).platform).toBe(0)
  })

  it('trades the platform loop for the ambience underground, louder in deeper bands', () => {
    const shallow = musicTargetsOf(underground(1))
    const deepest = musicTargetsOf(underground(5))
    expect(shallow).toMatchObject({ platform: 0, tension: 0 })
    expect(shallow.ambience).toBeGreaterThan(0)
    expect(deepest.ambience).toBe(1)
    expect(deepest.ambience).toBeGreaterThan(shallow.ambience)
  })

  it('brings the tension layer in from band 4', () => {
    expect(musicTargetsOf(underground(3)).tension).toBe(0)
    expect(musicTargetsOf(underground(4)).tension).toBeGreaterThan(0)
  })

  it('brings the tension layer in below the low-energy line, but not docked', () => {
    expect(musicTargetsOf({ ...awayFromHub, isEnergyLow: true }).tension).toBeGreaterThan(0)
    expect(musicTargetsOf({ ...awayFromHub, isEnergyLow: true, isDocked: true }).tension).toBe(0)
  })

  it('plays the combat layer with an enemy 7 m away and not at 9 m', () => {
    expect(musicTargetsOf({ ...underground(2), nearestEnemyMetres: 7 }).combat).toBeGreaterThan(0)
    expect(musicTargetsOf({ ...underground(2), nearestEnemyMetres: 9 }).combat).toBe(0)
    expect(musicTargetsOf({ ...underground(2), nearestEnemyMetres: 2 }).combat).toBeGreaterThan(
      musicTargetsOf({ ...underground(2), nearestEnemyMetres: 7 }).combat,
    )
  })

  it('crossfades the same at 30 and 144 frames/s', () => {
    const docked = musicTargetsOf({ ...awayFromHub, isDocked: true })
    const deep = musicTargetsOf(underground(4))
    const at30 = fade(docked, deep, 1, 30)
    const at144 = fade(docked, deep, 1, 144)
    expect(at30.platform).toBeCloseTo(at144.platform, 6)
    expect(at30.platform).toBeGreaterThan(0)
    expect(at30.platform).toBeLessThan(1)
  })

  it('measures the nearest enemy in metres from a point in millimetres, or none with no enemy', () => {
    const at = (x: number, y: number) => ({ x: x * 1000, y: y * 1000 }) as Enemy
    expect(nearestEnemyMetresOf([], { x: 0, y: 0 })).toBeNull()
    expect(nearestEnemyMetresOf([at(10, 0), at(3, 4)], { x: 0, y: 0 })).toBe(5)
  })

  it('tunes planet 2 differently from planet 1', () => {
    expect(planetTuningOf(1)).toBe(0)
    expect(planetTuningOf(2)).not.toBe(0)
  })
})

describe('music bus', () => {
  it('plays at the volume setting and falls silent when muted', () => {
    expect(musicBusGainOf({ musicVolume: 0.75, musicMuted: false }, false)).toBe(0.75)
    expect(musicBusGainOf({ musicVolume: 0.75, musicMuted: true }, false)).toBe(0)
  })

  it('ducks the layers 6 dB while the artefact choice is open', () => {
    expect(DUCKED_SHARE).toBeCloseTo(0.501, 3)
    expect(musicBusGainOf({ musicVolume: 1, musicMuted: false }, true)).toBe(DUCKED_SHARE)
  })
})
