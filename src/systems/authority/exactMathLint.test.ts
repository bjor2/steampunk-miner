import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// Decision #5 acceptance 4: the authority refuses maths that can differ between OSes and
// Electron versions. Lints source text as if it lived in the authority folder.
const eslint = new ESLint()

async function lintRuleIdsFor(source: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath })
  return result.messages.map((message) => message.ruleId ?? 'parse-error')
}

const AUTHORITY_FILE = 'src/systems/authority/someRule.ts'

describe('authority exact-maths lint', () => {
  it.each([
    'export const grown = Math.pow(1.15, 3)',
    'export const grown = Math.exp(2)',
    'export const digits = Math.log10(1000)',
    'export const digits = Math.log(1000)',
    'export const digits = Math.log2(1024)',
    'export const angle = Math.atan2(1, 2)',
    'export const side = Math.sin(1)',
    'export const grown = 1.15 ** 3',
    'export const wallet = Number("5")',
  ])('rejects %s', async (source) => {
    expect(await lintRuleIdsFor(source, AUTHORITY_FILE)).not.toEqual([])
  })

  it('allows the exact operations', async () => {
    const source = 'export const exact = Math.sqrt(16) + Math.floor(2.5) * 3 - 1 / 4'
    expect(await lintRuleIdsFor(source, AUTHORITY_FILE)).toEqual([])
  })

  it('rejects constructing a Decimal outside the Money module', async () => {
    const source = "import Decimal from 'decimal.js'\nexport const cash = new Decimal(5)"
    expect(await lintRuleIdsFor(source, 'src/store/someAction.ts')).toContain(
      'no-restricted-imports',
    )
    expect(await lintRuleIdsFor(source, AUTHORITY_FILE)).toContain('no-restricted-imports')
  })
})
