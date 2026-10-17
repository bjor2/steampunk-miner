/**
 * The GLSL a stage keeps once the preprocessor has run (TD #470 section 2, ticket 477): comments
 * dropped, `#ifdef`/`#ifndef`/`#else`/`#endif` followed against the material's defines, and any
 * other conditional refused, so a count read from it never guesses. Shared by the sampler count
 * (`shaderSamplers.ts`) and the uniform and varying counts (`shaderUniforms.ts`).
 */

/** The `defines` a ShaderMaterial prepends: a name is defined, and an array length may read one. */
export type ShaderDefines = Readonly<Record<string, unknown>>

const LINE_COMMENT = /\/\/.*$/gm
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g

/** `source` without comments and without the lines its conditionals leave out. */
export function activeShaderSourceOf(source: string, defines: ShaderDefines): string {
  return activeSourceOf(withoutComments(source), defines)
}

/** An array length as written, a number or a define naming one; throws on anything else. */
export function arrayLengthOf(length: string, defines: ShaderDefines): number {
  const value = /^\d+$/.test(length) ? Number(length) : Number(defines[length])
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`the array length ${length} is not a whole number`)
  }
  return value
}

function withoutComments(source: string): string {
  return source.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '')
}

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
    throw new Error(`the shader count cannot follow ${JSON.stringify(line)}`)
  } else return false
  return true
}
