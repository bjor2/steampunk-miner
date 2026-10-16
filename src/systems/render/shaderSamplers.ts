/**
 * How many texture units one GLSL stage binds (TD #470 section 2, ticket 477): every `sampler`
 * uniform counts one unit, an array counts its length, and code a `#ifdef`/`#ifndef` leaves out
 * counts none. The terrain program's spec holds its fragment stage to `TERRAIN_SAMPLER_CEILING`.
 * Read from the shader text the material compiles, so a sampler added anywhere is counted.
 */

/** The `defines` a ShaderMaterial prepends: a name is defined, and an array length may read one. */
export type ShaderDefines = Readonly<Record<string, unknown>>

const SAMPLER_UNIFORM = /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?[iu]?sampler\w*\s+([^;]+);/g
const DECLARATOR = /^(\w+)\s*(?:\[\s*(\w+)\s*\])?$/
const LINE_COMMENT = /\/\/.*$/gm
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g

/** Texture units `source` binds with `defines` in force; throws on a length it cannot read. */
export function samplerUnitsOf(source: string, defines: ShaderDefines = {}): number {
  const active = activeSourceOf(withoutComments(source), defines)
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

function withoutComments(source: string): string {
  return source.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '')
}

/**
 * The lines the preprocessor keeps: `#ifdef`, `#ifndef`, `#else` and `#endif` are followed; any
 * other conditional is refused, so the count never guesses.
 */
function activeSourceOf(source: string, defines: ShaderDefines): string {
  const kept: boolean[] = []
  const lines: string[] = []
  for (const line of source.split('\n')) {
    if (followsDirective(line.trim(), kept, defines)) continue
    if (kept.every(Boolean)) lines.push(line)
  }
  return lines.join('\n')
}

/** Applies a conditional directive to the stack; false for any other line. */
function followsDirective(line: string, kept: boolean[], defines: ShaderDefines): boolean {
  const [directive, name] = line.split(/\s+/)
  if (directive === '#ifdef') kept.push(Object.hasOwn(defines, name))
  else if (directive === '#ifndef') kept.push(!Object.hasOwn(defines, name))
  else if (directive === '#else') kept.push(!kept.pop())
  else if (directive === '#endif') kept.pop()
  else if (directive.startsWith('#if') || directive === '#elif') {
    throw new Error(`the sampler count cannot follow ${JSON.stringify(line)}`)
  } else return false
  return true
}

function unitsOfDeclarator(declarator: string, defines: ShaderDefines): number {
  const match = DECLARATOR.exec(declarator)
  if (match === null) throw new Error(`the sampler count cannot read ${JSON.stringify(declarator)}`)
  const length = match[2]
  if (length === undefined) return 1
  return arrayLengthOf(length, defines)
}

function arrayLengthOf(length: string, defines: ShaderDefines): number {
  const value = /^\d+$/.test(length) ? Number(length) : Number(defines[length])
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`the sampler array length ${length} is not a whole number`)
  }
  return value
}
