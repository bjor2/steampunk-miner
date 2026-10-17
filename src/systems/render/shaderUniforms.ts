/**
 * How many uniform and varying vectors one GLSL stage declares (TD shape on ticket 450, items 2
 * and 3): a scalar or a vector takes one vector, a matrix one per column, an array its length
 * times that; samplers take texture units instead (`shaderSamplers.ts`). Declared, not packed:
 * a compiler may pack two small uniforms into one vector, so the count is the upper bound the
 * WebGL2 floors (224 fragment uniform vectors, 15 varying vectors) are held against.
 */
import { activeShaderSourceOf, arrayLengthOf, type ShaderDefines } from './shaderSource'

const PRECISION = '(?:(?:lowp|mediump|highp)\\s+)?'
const UNIFORM = new RegExp(`\\buniform\\s+${PRECISION}(\\w+)\\s+([^;]+);`, 'g')
const VARYING = new RegExp(`\\b(?:flat\\s+)?varying\\s+${PRECISION}(\\w+)\\s+([^;]+);`, 'g')
const DECLARATOR = /^(\w+)\s*(?:\[\s*(\w+)\s*\])?$/
const SAMPLER_TYPE = /^[iu]?sampler/
const ONE_VECTOR_TYPE = /^(?:float|int|uint|bool|[iub]?vec[234])$/
const MATRIX_TYPE = /^mat([234])(?:x[234])?$/

/** Uniform vectors `source` declares with `defines` in force, samplers left out. */
export function uniformVectorsOf(source: string, defines: ShaderDefines = {}): number {
  return vectorsDeclaredBy(UNIFORM, source, defines)
}

/** Varying vectors `source` declares with `defines` in force. */
export function varyingVectorsOf(source: string, defines: ShaderDefines = {}): number {
  return vectorsDeclaredBy(VARYING, source, defines)
}

function vectorsDeclaredBy(pattern: RegExp, source: string, defines: ShaderDefines): number {
  const active = activeShaderSourceOf(source, defines)
  return [...active.matchAll(pattern)]
    .filter(([, type]) => !SAMPLER_TYPE.test(type))
    .reduce((vectors, [, type, declarators]) => {
      const perItem = vectorsPerItemOf(type)
      return vectors + lengthsOf(declarators, defines) * perItem
    }, 0)
}

function vectorsPerItemOf(type: string): number {
  if (ONE_VECTOR_TYPE.test(type)) return 1
  const matrix = MATRIX_TYPE.exec(type)
  if (matrix !== null) return Number(matrix[1])
  throw new Error(`the vector count cannot read the type ${type}`)
}

/** Every declarator's item count summed: `uA, uB[3]` is 4. */
function lengthsOf(declarators: string, defines: ShaderDefines): number {
  return declarators
    .split(',')
    .map((declarator) => itemsOfDeclarator(declarator.trim(), defines))
    .reduce((sum, items) => sum + items, 0)
}

function itemsOfDeclarator(declarator: string, defines: ShaderDefines): number {
  const match = DECLARATOR.exec(declarator)
  if (match === null) throw new Error(`the vector count cannot read ${JSON.stringify(declarator)}`)
  return match[2] === undefined ? 1 : arrayLengthOf(match[2], defines)
}
