import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// Decision #4 acceptance 7: world generation refuses maths an engine may approximate, so a co-op
// guest regenerates the same planet. Lints source text as if it lived in the world folder.
const eslint = new ESLint()

async function lintRuleIdsFor(
  source: string,
  filePath = 'src/systems/world/someRule.ts',
): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath })
  return result.messages.map((message) => message.ruleId ?? 'parse-error')
}

// Decision #36 acceptance 6: the carve, fill and density generator code is held to the same rule.
const DENSITY_MODULES = [
  'src/systems/world/groundEdit.ts',
  'src/systems/world/stampShape.ts',
  'src/systems/world/generateDensity.ts',
  'src/systems/world/orePatches.ts',
  'src/systems/vehicle/drillStamp.ts',
]

describe('world generation exact-maths lint', () => {
  it.each([
    'export const roll = Math.random()',
    'export const now = Date.now()',
    'export const side = Math.sin(1)',
    'export const side = Math.cos(1)',
    'export const angle = Math.atan2(1, 2)',
    'export const grown = Math.pow(1.15, 3)',
    'export const grown = 1.15 ** 3',
    'export const grown = Math.exp(2)',
    'export const digits = Math.log(1000)',
  ])('rejects %s', async (source) => {
    expect(await lintRuleIdsFor(source)).not.toEqual([])
  })

  it.each(DENSITY_MODULES)('rejects banned maths in the density module %s', async (filePath) => {
    for (const source of [
      'export const side = Math.sin(1)',
      'export const roll = Math.random()',
      'export const grown = Math.pow(1.15, 3)',
    ]) {
      expect(await lintRuleIdsFor(source, filePath)).not.toEqual([])
    }
  })

  it('allows the exact operations the generator uses', async () => {
    const source =
      'export const exact = Math.imul(3, 5) + Math.floor(2.5) * Math.sqrt(16) - Math.min(1, Math.max(0, Math.abs(-2))) / 4'
    expect(await lintRuleIdsFor(source)).toEqual([])
  })
})
