import { describe, expect, it } from 'vitest'
import { GPU_MIN_TEXTURE_UNITS, TERRAIN_SAMPLER_CEILING } from '../constants/scene'
import { samplerCeilingProblems, samplerUnitsOf } from '../systems/render/shaderSamplers'
import { createTerrainMaterial } from './terrainMaterial'
import { TERRAIN_FRAGMENT_SHADER, TERRAIN_VERTEX_SHADER } from './terrainShader'

/** The terrain program as the GPU compiles it: the material's own shader text and defines. */
function fragmentProblemsOf(program: 'full' | 'lite', ceiling: number): string[] {
  const material = createTerrainMaterial(program)
  return samplerCeilingProblems(
    `the ${program} terrain fragment stage`,
    material.fragmentShader,
    material.defines,
    ceiling,
  )
}

const SIXTEENTH_SAMPLER = `${TERRAIN_FRAGMENT_SHADER}\nuniform sampler2D uHeroAtlas;\n`

describe('terrain program samplers (TD #470 section 2, ticket 477)', () => {
  it('binds at most 15 samplers in the full fragment stage, one under WebGL2 guaranteed 16', () => {
    expect(fragmentProblemsOf('full', TERRAIN_SAMPLER_CEILING)).toEqual([])
    expect(samplerUnitsOf(TERRAIN_FRAGMENT_SHADER)).toBe(15)
  })

  it('fails the ceiling when a 16th sampler is added to the fragment stage', () => {
    expect(
      samplerCeilingProblems('fixture', SIXTEENTH_SAMPLER, {}, TERRAIN_SAMPLER_CEILING),
    ).toEqual(['fixture binds 16 samplers, over the ceiling of 15'])
  })

  it('fits the lite program within the 12 units of the weakest GPU the game still runs on', () => {
    expect(fragmentProblemsOf('lite', GPU_MIN_TEXTURE_UNITS)).toEqual([])
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
