import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// TD lock on #146: ores.economy.json is one of the Vertical Scaler cache's sourceHash inputs, so
// an edit to the lead weights invalidates the cache like an edit to the economy tables.

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = join(REPO_ROOT, 'docs/scaling/vertical/source_hash.mjs')
const INPUTS = ['docs/economy', 'src/features/ores/ores.economy.json']
const ORES_FILE = 'src/features/ores/ores.economy.json'

function sourceHashAt(root: string): string {
  return execFileSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' }).trim()
}

/** The hash of a copy of the inputs with the ores file edited by `edit`. */
function sourceHashWithOresFile(edit: (text: string) => string): string {
  const root = mkdtempSync(join(tmpdir(), 'vertical-hash-'))
  try {
    for (const input of INPUTS)
      cpSync(join(REPO_ROOT, input), join(root, input), { recursive: true })
    writeFileSync(join(root, ORES_FILE), edit(readFileSync(join(root, ORES_FILE), 'utf8')))
    return sourceHashAt(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('vertical source hash', () => {
  it('moves when ores.economy.json changes and holds when it does not', () => {
    const committed = sourceHashAt(REPO_ROOT)
    expect(committed).toMatch(/^[0-9a-f]{16}$/)
    expect(sourceHashWithOresFile((text) => text)).toBe(committed)
    expect(sourceHashWithOresFile((text) => text.replace('[500,', '[250,'))).not.toBe(committed)
  })
})
