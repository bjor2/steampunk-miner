import { describe, expect, it } from 'vitest'
import { uniformVectorsOf, varyingVectorsOf } from '../systems/render/shaderUniforms'
import { createTerrainMaterial } from './terrainMaterial'
import { KIND_LOOK_UNIFORMS, kindLookDefines } from './terrainKindShader'

// The TD's budgets on ticket 450 (shape 6226270701, items 2 and 3): the material look adds at
// most 24 fragment uniform vectors, the whole stage declares at most 96 of the WebGL2 floor of 224,
// and the program keeps at least 4 of the guaranteed 15 varyings spare.

/** three's fragment prefix for a ShaderMaterial: viewMatrix (4), cameraPosition, isOrthographic. */
const THREE_FRAGMENT_PREFIX_VECTORS = 6
const FRAGMENT_VECTOR_BUDGET = 96
const KIND_LOOK_VECTOR_BUDGET = 24
const GUARANTEED_VARYINGS = 15
const SPARE_VARYINGS = 4

describe('terrain program uniforms and varyings (ticket 450)', () => {
  it('adds at most 24 fragment uniform vectors for the material look', () => {
    expect(uniformVectorsOf(KIND_LOOK_UNIFORMS, kindLookDefines())).toBeLessThanOrEqual(
      KIND_LOOK_VECTOR_BUDGET,
    )
  })

  it('declares at most 96 fragment uniform vectors in the full program', () => {
    const material = createTerrainMaterial('full')
    const declared = uniformVectorsOf(material.fragmentShader, material.defines)
    expect(declared + THREE_FRAGMENT_PREFIX_VECTORS).toBeLessThanOrEqual(FRAGMENT_VECTOR_BUDGET)
  })

  it('keeps 4 of the 15 guaranteed varyings spare in either program', () => {
    for (const program of ['full', 'lite'] as const) {
      const material = createTerrainMaterial(program)
      expect(varyingVectorsOf(material.vertexShader, material.defines)).toBeLessThanOrEqual(
        GUARANTEED_VARYINGS - SPARE_VARYINGS,
      )
    }
  })

  it('leaves the lite program without the material look', () => {
    const material = createTerrainMaterial('lite')
    expect(uniformVectorsOf(KIND_LOOK_UNIFORMS, material.defines)).toBe(0)
    expect(material.fragmentShader).toContain('kindLookOf')
  })
})
