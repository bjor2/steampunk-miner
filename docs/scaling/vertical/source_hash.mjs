// The Vertical Scaler's cache `sourceHash`, reproducible. Node, no deps.
// Usage: node docs/scaling/vertical/source_hash.mjs [--root <repo root>]  ->  <16 hex>
//
// Method ("sha256-16 of path+bytes"): one sha256 over every input in the order below, each fed as
// its repo-relative path, a NUL byte, the file's bytes and a NUL byte; the first 16 hex digits.
// Over the first three inputs at 1a3bd3be it gives 645f1261fddc40d3, the cache's hash then.
// The ores slice's numbers (lead weights, signature value lead and caps) join the inputs, so a
// change there invalidates the cache like a change to the economy tables (TD lock on #146).
// src/features/ores/oresSourceHash.test.ts checks that an ores.economy.json edit moves the hash.
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

export const VERTICAL_SOURCE_PATHS = [
  'docs/economy/economy-constants.json',
  'docs/economy/vehicle-table.md',
  'docs/economy/price-table.md',
  'src/features/ores/ores.economy.json',
]

const NUL = Buffer.from([0])

export function verticalSourceHashOf(root) {
  const hash = createHash('sha256')
  for (const path of VERTICAL_SOURCE_PATHS) {
    hash.update(path)
    hash.update(NUL)
    hash.update(readFileSync(join(root, path)))
    hash.update(NUL)
  }
  return hash.digest('hex').slice(0, 16)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--root')
  const root =
    at === -1 ? fileURLToPath(new URL('../../../', import.meta.url)) : process.argv[at + 1]
  process.stdout.write(`${verticalSourceHashOf(root)}\n`)
}
