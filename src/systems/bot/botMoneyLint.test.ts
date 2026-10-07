import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// #196: a price as a double is Infinity past planet 582, so the pacing bot keeps money as Money.
// Lints source text as if it lived in the bot folder.
const eslint = new ESLint()

async function lintRuleIdsFor(source: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, { filePath })
  return result.messages.map((message) => message.ruleId ?? 'parse-error')
}

const BOT_FILE = 'src/systems/bot/somePlan.ts'
const PRICE = "import { fromCanonical } from '../money'\nconst price = fromCanonical('1e600')\n"

describe('bot money lint', () => {
  it.each([
    'export const rate = Number(price)',
    'export const rate = (price as unknown as { toNumber(): number }).toNumber()',
    'export const rate = Number.parseFloat(String(price))',
    'export const rate = parseFloat(String(price))',
  ])('rejects %s', async (line) => {
    expect(await lintRuleIdsFor(`${PRICE}${line}`, BOT_FILE)).toContain('no-restricted-syntax')
  })

  it('allows a bounded count through toSafeInteger and comparisons through cmp', async () => {
    const source = [
      "import { ceil, cmp, fromCanonical, toSafeInteger } from '../money'",
      "const price = fromCanonical('1e600')",
      'export const isDear = cmp(price, price) > 0',
      "export const tiles = toSafeInteger(ceil(fromCanonical('2.5')))",
      '',
    ].join('\n')
    expect(await lintRuleIdsFor(source, BOT_FILE)).toEqual([])
  })

  it('still bans import.meta in the bot, as in every pure rule', async () => {
    expect(await lintRuleIdsFor('export const mode = import.meta.env', BOT_FILE)).toContain(
      'no-restricted-syntax',
    )
  })
})
