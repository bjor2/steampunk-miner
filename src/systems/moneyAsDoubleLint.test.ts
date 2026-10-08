import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// Ticket 340 (#316 TD scope f): money text never goes back through a double outside src/logging.
// Lints source text as if it lived at each path.
const eslint = new ESLint()
/** The first lint loads every plugin; a busy box needs more than the default 5 s. */
const LINT_TIMEOUT_MS = 60_000
const RULE = 'money/no-money-as-double'

async function lintRuleIdsFor(source: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath })
  return result.messages.map((message) => message.ruleId ?? 'parse-error')
}

const PRICE = [
  "import { fromCanonical, toCanonical } from '../money'",
  "import { exactAmount } from '../displayAmount'",
  "export const price = fromCanonical('1e400')",
  'export const text = toCanonical(price)',
  'export const exact = exactAmount(price)',
  '',
].join('\n')

describe('money as a double lint', { timeout: LINT_TIMEOUT_MS }, () => {
  it.each([
    'export const shown = Number(toCanonical(price))',
    'export const shown = Number(exactAmount(price))',
    'export const shown = parseFloat(text)',
    'export const shown = Number.parseFloat(text)',
  ])('rejects %s in a view and in a script', async (line) => {
    expect(await lintRuleIdsFor(`${PRICE}${line}`, 'src/systems/views/someRow.ts')).toContain(RULE)
    expect(await lintRuleIdsFor(`${PRICE}${line}`, 'scripts/someReport.ts')).toContain(RULE)
  })

  it('leaves the run logs and reports in src/logging to parse what they print', async () => {
    const source = `${PRICE}export const shown = Number.parseFloat(text)`
    expect(await lintRuleIdsFor(source, 'src/logging/someReport.ts')).not.toContain(RULE)
  })

  it('allows a whole count through parseInt and a plain Number of a count', async () => {
    const source = [
      'export const exponent = Number.parseInt(text.split("e")[1], 10)',
      'export const count = Number(text.length)',
      '',
    ].join('\n')
    expect(await lintRuleIdsFor(`${PRICE}${source}`, 'src/systems/views/someRow.ts')).toEqual([])
  })
})
