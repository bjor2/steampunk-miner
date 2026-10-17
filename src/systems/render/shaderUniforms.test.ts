import { describe, expect, it } from 'vitest'
import { uniformVectorsOf, varyingVectorsOf } from './shaderUniforms'

describe('shader vector count', () => {
  it('counts a scalar or vector as one vector, a matrix by its columns and an array by its length', () => {
    const source = [
      'uniform float uOne;',
      'uniform highp vec3 uTwo, uThree[4];',
      'uniform mat3 uTurn;',
      'uniform vec4 uTable[COUNT];',
    ].join('\n')
    expect(uniformVectorsOf(source, { COUNT: 16 })).toBe(1 + 1 + 4 + 3 + 16)
  })

  it('leaves samplers, comments and branches the defines skip out of the uniform count', () => {
    const source = [
      'uniform sampler2D uMap;',
      '// uniform vec4 uCommented;',
      '#ifndef LITE',
      'uniform vec4 uFull[2];',
      '#endif',
    ].join('\n')
    expect(uniformVectorsOf(source)).toBe(2)
    expect(uniformVectorsOf(source, { LITE: 1 })).toBe(0)
  })

  it('counts varyings the same way', () => {
    expect(varyingVectorsOf('varying vec2 vA;\nflat varying float vB;\nvarying vec4 vC[2];')).toBe(
      4,
    )
  })

  it('refuses a type it cannot size rather than guess', () => {
    expect(() => uniformVectorsOf('uniform Light uLight;')).toThrow(/cannot read the type/)
  })
})
