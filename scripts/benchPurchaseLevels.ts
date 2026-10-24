/**
 * Streaming and tick cost by purchase level (ticket 840, the Systems row set and the GVD feel bar
 * from the #316 decision): L1, L20, L30, L40 and the radius-clamp level, on planets 1, 5, 10 and
 * 40, on the desktop and phone profiles (`bench/purchaseLevelRows.ts`). Each row drives its rig
 * down a column through the authority and streams the terrain and the hazard strip around it
 * (`bench/purchaseLevelRun.ts`). Measured and printed, never gated: a red row is a streaming or
 * prefetch finding under #647, never a speed clamp. Run with `npm run bench:purchase-levels`.
 *
 * Prints one JSON line a row as it finishes, then the judged lines and the table to post on the
 * ticket, which it also writes to `test-results/bench-purchase-levels/` (`rows.ndjson`,
 * `table.md`). `-- --planets 1,5 --levels L1,L20 --profiles phone` runs a subset; the vs-L1 ratio
 * needs the L1 row of the same planet and profile in the run.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadFeatures } from '../src/features'
import {
  judgeRowLines,
  markdownTableOf,
  rowLineOf,
  type RowLine,
} from './bench/purchaseLevelReport'
import { rowsOf, type RowFilter } from './bench/purchaseLevelRows'
import { runRow } from './bench/purchaseLevelRun'

loadFeatures()

const RESULTS_DIR = new URL('../test-results/bench-purchase-levels/', import.meta.url)

function filterOf(argv: readonly string[]): RowFilter {
  return {
    planets: listAfter(argv, '--planets'),
    levels: listAfter(argv, '--levels'),
    profiles: listAfter(argv, '--profiles'),
  }
}

function listAfter(argv: readonly string[], flag: string): string[] | null {
  const at = argv.indexOf(flag)
  return at < 0 || at + 1 >= argv.length ? null : argv[at + 1].split(',')
}

function measureRows(filter: RowFilter): RowLine[] {
  return rowsOf(filter).map((row) => {
    const line = rowLineOf(row, runRow(row))
    console.log(JSON.stringify(line))
    return line
  })
}

function writeResults(lines: readonly RowLine[], table: string): void {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const ndjson = lines.map((line) => JSON.stringify(line)).join('\n')
  writeFileSync(new URL('rows.ndjson', RESULTS_DIR), `${ndjson}\n`)
  writeFileSync(new URL('table.md', RESULTS_DIR), `${table}\n`)
}

function main(): void {
  const judged = judgeRowLines(measureRows(filterOf(process.argv.slice(2))))
  const table = markdownTableOf(judged)
  writeResults(judged, table)
  for (const line of judged) console.log(JSON.stringify({ ...line, judged: true }))
  console.log(`\n${table}`)
}

main()
