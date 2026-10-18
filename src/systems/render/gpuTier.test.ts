import { describe, expect, it } from 'vitest'
import { heroAtlasUnitOf, sceneTargetOf, terrainProgramOf, type GpuCapabilities } from './gpuTier'

/** WebGL2's guaranteed minimums with float targets: what current phones and desktops report. */
const WEBGL2_FLOOR: GpuCapabilities = {
  textureUnits: 16,
  vertexTextureUnits: 16,
  combinedTextureUnits: 32,
  maxTextureSize: 4096,
  fragmentUniformVectors: 224,
  varyingVectors: 15,
  isFragmentHighp: true,
  hasFloatTargets: true,
  hasHalfFloatTargets: true,
  textureFormats: ['astc', 'etc2'],
}

const gpuWith = (readings: Partial<GpuCapabilities>): GpuCapabilities => ({
  ...WEBGL2_FLOOR,
  ...readings,
})

describe('gpu capability decision table (TD #470 section 2.3, ticket 477)', () => {
  it.each([
    ['16 units, 4096 px, highp', {}, 'full'],
    ['exactly the 15 units the full program binds', { textureUnits: 15 }, 'full'],
    ['14 units', { textureUnits: 14 }, 'lite'],
    ['12 units, the hard minimum', { textureUnits: 12 }, 'lite'],
    ['no fragment highp', { isFragmentHighp: false }, 'lite'],
    ['11 units', { textureUnits: 11 }, 'unsupported'],
    ['textures under 2048 px', { maxTextureSize: 1024 }, 'unsupported'],
    ['11 units and no highp', { textureUnits: 11, isFragmentHighp: false }, 'unsupported'],
  ] as const)('maps %s to the %s terrain program', (_, readings, program) => {
    expect(terrainProgramOf(gpuWith(readings))).toBe(program)
  })

  it.each([
    ['float colour targets', { hasHalfFloatTargets: false }, 'half_float'],
    ['only half-float colour targets', { hasFloatTargets: false }, 'half_float'],
    ['no float colour targets', { hasFloatTargets: false, hasHalfFloatTargets: false }, 'rgba8'],
  ] as const)('draws the scene into a %s target as %s', (_, readings, target) => {
    expect(sceneTargetOf(gpuWith(readings))).toBe(target)
  })

  it.each([
    ['16 units, the full program and ETC2', {}, 'sampled'],
    ['BC7 alone', { textureFormats: ['bptc'] }, 'sampled'],
    ['BC3 alone', { textureFormats: ['s3tc'] }, 'sampled'],
    ['exactly the 15 units of the full program', { textureUnits: 15 }, 'absent'],
    ['the lite program', { isFragmentHighp: false }, 'absent'],
    ['no compressed format', { textureFormats: [] }, 'absent'],
    ['only ASTC, which ETC1S cannot reach', { textureFormats: ['astc'] }, 'absent'],
    ['only ETC1, which has no alpha', { textureFormats: ['etc1'] }, 'absent'],
  ] as const)(
    'gives the hero atlas the 16th unit with %s: %s (ticket 451)',
    (_, readings, unit) => {
      expect(heroAtlasUnitOf(gpuWith(readings))).toBe(unit)
    },
  )
})
