import { describe, expect, it } from 'vitest'
import {
  GPU_MIN_TEXTURE_UNITS,
  TERRAIN_FULL_SAMPLERS,
  TERRAIN_SAMPLER_CEILING,
} from '../constants/scene'
import type { HeroAtlasUnit, TerrainProgram } from '../systems/render/gpuTier'
import { samplerCeilingProblems, samplerUnitsOf } from '../systems/render/shaderSamplers'
import { createTerrainMaterial } from './terrainMaterial'
import { TERRAIN_FRAGMENT_SHADER, TERRAIN_VERTEX_SHADER } from './terrainShader'

/** The terrain program as the GPU compiles it: the material's own shader text and defines. */
function materialOf(program: TerrainProgram, heroAtlas: HeroAtlasUnit = 'absent') {
  return createTerrainMaterial(program, heroAtlas)
}

function fragmentProblemsOf(
  program: TerrainProgram,
  ceiling: number,
  heroAtlas: HeroAtlasUnit = 'absent',
): string[] {
  const material = materialOf(program, heroAtlas)
  return samplerCeilingProblems(
    `the ${program} terrain fragment stage`,
    material.fragmentShader,
    material.defines,
    ceiling,
  )
}

const WITH_HERO_ATLAS = materialOf('full', 'sampled').defines
const SEVENTEENTH_SAMPLER = `${TERRAIN_FRAGMENT_SHADER}\nuniform sampler2D uSeventeenth;\n`

describe('terrain program samplers (TD #470 section 2, tickets 477 and 451)', () => {
  it('binds 15 samplers in the full fragment stage without the hero atlas', () => {
    expect(fragmentProblemsOf('full', TERRAIN_FULL_SAMPLERS)).toEqual([])
    expect(samplerUnitsOf(TERRAIN_FRAGMENT_SHADER)).toBe(TERRAIN_FULL_SAMPLERS)
  })

  it('takes the 16th unit for the hero atlas and no more, the WebGL2 guaranteed 16', () => {
    expect(fragmentProblemsOf('full', TERRAIN_SAMPLER_CEILING, 'sampled')).toEqual([])
    expect(samplerUnitsOf(TERRAIN_FRAGMENT_SHADER, WITH_HERO_ATLAS)).toBe(16)
    expect(TERRAIN_SAMPLER_CEILING).toBe(16)
  })

  it('fails the ceiling when a 17th sampler is added to the fragment stage', () => {
    expect(
      samplerCeilingProblems(
        'fixture',
        SEVENTEENTH_SAMPLER,
        WITH_HERO_ATLAS,
        TERRAIN_SAMPLER_CEILING,
      ),
    ).toEqual(['fixture binds 17 samplers, over the ceiling of 16'])
  })

  it('fits the lite program within the 12 units of the weakest GPU the game still runs on', () => {
    expect(fragmentProblemsOf('lite', GPU_MIN_TEXTURE_UNITS)).toEqual([])
    expect(fragmentProblemsOf('lite', GPU_MIN_TEXTURE_UNITS, 'sampled')).toEqual([])
    expect(samplerUnitsOf(TERRAIN_FRAGMENT_SHADER, { TERRAIN_LITE: 1 })).toBe(5)
  })

  it('binds no sampler in the vertex stage', () => {
    expect(samplerUnitsOf(TERRAIN_VERTEX_SHADER)).toBe(0)
  })
})

describe('shader sampler count', () => {
  it('counts an array by its length, read from a define where the source names one', () => {
    const source = 'uniform sampler2D uMaps[COUNT];\nuniform highp sampler2D uOne, uTwo[2];'
    expect(samplerUnitsOf(source, { COUNT: 4 })).toBe(7)
  })

  it('leaves out samplers in comments and in branches the defines skip', () => {
    const source = [
      '// uniform sampler2D uCommented;',
      '#ifdef SHOWN',
      'uniform sampler2D uShown;',
      '#else',
      'uniform sampler2D uOther;',
      '#endif',
    ].join('\n')
    expect(samplerUnitsOf(source, { SHOWN: 1 })).toBe(1)
    expect(samplerUnitsOf(source)).toBe(1)
  })

  it('refuses a conditional it cannot follow rather than guess', () => {
    expect(() => samplerUnitsOf('#if COUNT > 1\nuniform sampler2D uMap;\n#endif')).toThrow(
      /cannot follow/,
    )
  })
})
