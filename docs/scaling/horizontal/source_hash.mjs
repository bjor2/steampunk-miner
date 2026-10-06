// The Horizontal Scaler's `source_hash` for stats.json, reproducible (#153). Node, no deps.
// Usage: node docs/scaling/horizontal/source_hash.mjs [path/to/stats.json]  ->  sha256:<hex>
//
// Canonical form: JSON.stringify of {ids, schema, fills} with every object's keys sorted (arrays
// keep their order), hashed as UTF-8 with sha256.
//   ids:    every features[].id, sorted
//   schema: the file's `schema` object (#79), as is
//   fills:  the #80 lock fills, the rows with origin "schedule_lock_80", each as
//           {id, planetIndex, lockNote}, sorted by id
// Status and every other row field are not hashed, so a status flip keeps the hash; a new, removed
// or renamed id, a schema change or a moved or re-noted lock fill changes it.
// src/systems/unlocks/unlockSchedule.test.ts recomputes this and checks the stored source_hash.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

export const LOCK_FILL_ORIGIN = 'schedule_lock_80'

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort(byCodeUnit)
      .map((key) => [key, sortKeys(value[key])]),
  )
}

export function sourceHashCanonical(stats) {
  const ids = stats.features.map((row) => row.id).sort(byCodeUnit)
  const fills = stats.features
    .filter((row) => row.origin === LOCK_FILL_ORIGIN)
    .map((row) => ({ id: row.id, planetIndex: row.planetIndex, lockNote: row.lockNote }))
    .sort((a, b) => byCodeUnit(a.id, b.id))
  return JSON.stringify(sortKeys({ ids, schema: stats.schema, fills }))
}

export function sourceHashOf(stats) {
  return `sha256:${createHash('sha256').update(sourceHashCanonical(stats), 'utf8').digest('hex')}`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? fileURLToPath(new URL('./stats.json', import.meta.url))
  process.stdout.write(`${sourceHashOf(JSON.parse(readFileSync(path, 'utf8')))}\n`)
}
