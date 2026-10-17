/**
 * How many texture units one GLSL stage binds (TD #470 section 2, ticket 477): every `sampler`
 * uniform counts one unit, an array counts its length, and code a `#ifdef`/`#ifndef` leaves out
 * counts none. The terrain program's spec holds its fragment stage to `TERRAIN_SAMPLER_CEILING`.
 * Read from the shader text the material compiles, so a sampler added anywhere is counted.
 */
import { activeShaderSourceOf, arrayLengthOf, type ShaderDefines } from './shaderSource'

export type { ShaderDefines } from './shaderSource'

const SAMPLER_UNIFORM = /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?[iu]?sampler\w*\s+([^;]+);/g
const DECLARATOR = /^(\w+)\s*(?:\[\s*(\w+)\s*\])?$/

/** Texture units `source` binds with `defines` in force; throws on a length it cannot read. */
export function samplerUnitsOf(source: string, defines: ShaderDefines = {}): number {
  const active = activeShaderSourceOf(source, defines)
  return [...active.matchAll(SAMPLER_UNIFORM)]
    .flatMap((match) => match[1].split(','))
    .reduce((units, declarator) => units + unitsOfDeclarator(declarator.trim(), defines), 0)
}

/** Why the stage binds too many units for `ceiling`; empty when it fits. */
export function samplerCeilingProblems(
  stage: string,
  source: string,
  defines: ShaderDefines,
  ceiling: number,
): string[] {
  const units = samplerUnitsOf(source, defines)
  return units <= ceiling
    ? []
    : [`${stage} binds ${units} samplers, over the ceiling of ${ceiling}`]
}

function unitsOfDeclarator(declarator: string, defines: ShaderDefines): number {
  const match = DECLARATOR.exec(declarator)
  if (match === null) throw new Error(`the sampler count cannot read ${JSON.stringify(declarator)}`)
  const length = match[2]
  if (length === undefined) return 1
  return arrayLengthOf(length, defines)
}
