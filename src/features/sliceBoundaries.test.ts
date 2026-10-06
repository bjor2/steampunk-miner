import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// The lint proof of docs/standards/feature-slices.md 2.4, run against the repo's own
// eslint.config.js. `boundary-probe` is no folder: zone targets are path patterns.
const eslint = new ESLint()
const SLICE_FILE = 'src/features/boundary-probe/probe.ts'
/** The first lint loads every plugin; a busy box needs more than the default 5 s. */
const LINT_TIMEOUT_MS = 60_000

async function errorsOf(ruleId: string, filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
    .filter((message) => message.ruleId === ruleId)
    .map((message) => message.message)
}

function boundaryErrorsOf(filePath: string, code: string): Promise<string[]> {
  return errorsOf('import-x/no-restricted-paths', filePath, code)
}

describe('slice boundary lint', { timeout: LINT_TIMEOUT_MS }, () => {
  it('refuses a slice importing another slice past its index', async () => {
    const errors = await boundaryErrorsOf(
      SLICE_FILE,
      "import { slice } from '../example/register'\nexport const probe = slice\n",
    )
    expect(errors).toEqual([
      expect.stringContaining(
        'Another slice imports slice "example" only through src/features/example/index.ts.',
      ),
    ])
  })

  it('lets a slice import another slice through its index', async () => {
    const errors = await boundaryErrorsOf(
      SLICE_FILE,
      "import { EXAMPLE_SLICE_ID } from '../example'\nexport const probe = EXAMPLE_SLICE_ID\n",
    )
    expect(errors).toEqual([])
  })

  it('refuses the kernel importing any slice', async () => {
    const errors = await boundaryErrorsOf(
      'src/systems/world/probe.ts',
      "import { EXAMPLE_SLICE_ID } from '../../features/example'\nexport const probe = EXAMPLE_SLICE_ID\n",
    )
    expect(errors).toHaveLength(1)
  })

  it('refuses a slice importing the loader', async () => {
    const errors = await boundaryErrorsOf(
      SLICE_FILE,
      "import { loadFeatures } from '../index'\nexport const probe = loadFeatures\n",
    )
    expect(errors).toHaveLength(1)
  })

  it('refuses a slice importing artDirection.json', async () => {
    const errors = await errorsOf(
      '@typescript-eslint/no-restricted-imports',
      SLICE_FILE,
      "import art from '../../systems/render/artDirection.json'\nexport const probe = art\n",
    )
    expect(errors).toHaveLength(1)
  })
})
