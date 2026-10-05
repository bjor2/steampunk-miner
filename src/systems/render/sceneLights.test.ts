import { describe, expect, it } from 'vitest'
import { AMBIENT_DEEP, AMBIENT_SURFACE, MAX_POINT_LIGHTS } from '../../constants/scene'
import { platformLookOf } from './platformPlaceholder'
import {
  ambientAtDepth,
  choosePointLights,
  createDrillSparkLight,
  platformLightsOf,
  type PointLightSource,
} from './sceneLights'

function lampAt(id: string, x: number, rangeM = 3): PointLightSource {
  return { id, x, y: 0, colour: '#ffffff', rangeM, strength: 1 }
}

describe('scene lights', () => {
  it('lights at most 4 point lights however many sources are in view (#38)', () => {
    const sources = [1, 2, 3, 4, 5, 6].map((x) => lampAt(`lamp-${x}`, x))
    const chosen: PointLightSource[] = []
    choosePointLights(sources, { x: 0, y: 0 }, 12, chosen)
    expect(chosen).toHaveLength(MAX_POINT_LIGHTS)
  })

  it('keeps the nearest sources, nearest first', () => {
    const sources = [lampAt('far', 9), lampAt('near', -1), lampAt('mid', 4)]
    const chosen: PointLightSource[] = []
    choosePointLights(sources, { x: 0, y: 0 }, 12, chosen)
    expect(chosen.map((light) => light.id)).toEqual(['near', 'mid', 'far'])
  })

  it('skips a source whose light cannot reach the view circle', () => {
    const chosen: PointLightSource[] = []
    choosePointLights([lampAt('beyond', 20, 3), lampAt('edge', 14, 3)], { x: 0, y: 0 }, 12, chosen)
    expect(chosen.map((light) => light.id)).toEqual(['edge'])
  })

  it('adds the core drive glow to the platform lamps once the platform shows it', () => {
    const origin = { x: 0.5, y: 300 }
    const outpost = platformLightsOf(origin, platformLookOf('outpost').lamps)
    const coreDrive = platformLightsOf(origin, platformLookOf('core_drive').lamps)
    expect(outpost.map((light) => light.id)).toEqual(['platform-lamp'])
    expect(coreDrive.map((light) => light.id)).toEqual(['platform-lamp', 'core-drive-glow'])
    expect(coreDrive[1].y).toBeGreaterThan(origin.y)
  })

  it('names the drill spark light so a light count can be read by source', () => {
    expect(createDrillSparkLight().id).toBe('drill-sparks')
  })

  it('fades the ambient light from the surface value to the deep value with depth', () => {
    expect(ambientAtDepth(-5)).toBe(AMBIENT_SURFACE)
    expect(ambientAtDepth(0)).toBe(AMBIENT_SURFACE)
    expect(ambientAtDepth(1000)).toBeCloseTo(AMBIENT_DEEP, 9)
    expect(ambientAtDepth(10)).toBeLessThan(AMBIENT_SURFACE)
  })
})
