import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// K7 (#199) acceptance 10: the descriptions slice may not turn a stat into a double on its way to
// the card (Vertical Scaler on #164). Run against the repo's own eslint.config.js; the slice folder
// need not exist, since the config matches paths.
const eslint = new ESLint()
const SYSTEMS_FILE = 'src/features/descriptions/systems/statLines.ts'
const UI_FILE = 'src/features/descriptions/ui/Card.tsx'
/** The first lint loads every plugin; a busy box needs more than the default 5 s. */
const LINT_TIMEOUT_MS = 60_000

async function ruleIdsOf(filePath: string, code: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((message) => message.ruleId)
}

describe('descriptions double-conversion lint', { timeout: LINT_TIMEOUT_MS }, () => {
  it('fails on a planted toFixed in the descriptions slice', async () => {
    const ruleIds = await ruleIdsOf(
      SYSTEMS_FILE,
      'export const shown = (x: number) => x.toFixed(1)\n',
    )
    expect(ruleIds).toEqual(['no-restricted-syntax'])
  })

  it.each([
    'x.toPrecision(3)',
    'x.toLocaleString()',
    'Number(x)',
    'parseFloat(x)',
    'Number.parseFloat(x)',
  ])('fails on %s anywhere in the slice', async (call) => {
    const ruleIds = await ruleIdsOf(UI_FILE, `export const shown = (x: unknown) => ${call}\n`)
    expect(ruleIds).toEqual(['no-restricted-syntax'])
  })

  it('keeps the pure-rule bans in the slice systems folder', async () => {
    const ruleIds = await ruleIdsOf(SYSTEMS_FILE, 'export const grown = (x: number) => x ** 2\n')
    expect(ruleIds).toEqual(['no-restricted-syntax'])
  })

  it('leaves toFixed alone outside the descriptions slice', async () => {
    const ruleIds = await ruleIdsOf(
      'src/features/example/ui/Card.tsx',
      'export const shown = (x: number) => x.toFixed(1)\n',
    )
    expect(ruleIds).toEqual([])
  })
})
