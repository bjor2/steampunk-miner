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
 *
 * The explosion rows (D8 ticket 868, `bench/blastVfxRows.ts`) follow: sizes 1, 6 and 12 at Blast
 * Radius levels 0, 10 and 1e6 on 360 px, 1280x800 and 1920x1080, each one blast played through the
 * real front pools and timed a frame at a time. `-- --rows vfx` runs only them, `--rows purchase`
 * only the purchase rows; `--sizes 1,6 --radius-levels 0 --screens phone360` picks among them.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadFeatures } from '../src/features'
import {
  judgeRowLines,
  markdownTableOf,
  rowLineOf,
  type RowLine,
} from './bench/purchaseLevelReport'
import {
  runVfxRow,
  vfxRowsOf,
  vfxTableOf,
  type VfxRowFilter,
  type VfxRowLine,
} from './bench/blastVfxRows'
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

function vfxFilterOf(argv: readonly string[]): VfxRowFilter {
  return {
    sizes: listAfter(argv, '--sizes'),
    levels: listAfter(argv, '--radius-levels'),
    screens: listAfter(argv, '--screens'),
  }
}

/** Which row families run: both unless `--rows` names one. */
function rowFamiliesOf(argv: readonly string[]): string[] {
  return listAfter(argv, '--rows') ?? ['purchase', 'vfx']
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

function measureVfxRows(filter: VfxRowFilter): VfxRowLine[] {
  return vfxRowsOf(filter).map((row) => {
    const line = runVfxRow(row)
    console.log(JSON.stringify(line))
    return line
  })
}

function writeResults(lines: readonly (RowLine | VfxRowLine)[], table: string): void {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const ndjson = lines.map((line) => JSON.stringify(line)).join('\n')
  writeFileSync(new URL('rows.ndjson', RESULTS_DIR), `${ndjson}\n`)
  writeFileSync(new URL('table.md', RESULTS_DIR), `${table}\n`)
}

/** The purchase table, then the explosion table, each only when its family ran. */
function tablesOf(judged: readonly RowLine[], vfx: readonly VfxRowLine[]): string {
  const parts = [
    judged.length > 0 ? markdownTableOf(judged) : '',
    vfx.length > 0 ? vfxTableOf(vfx) : '',
  ]
  return parts.filter((part) => part !== '').join('\n\n')
}

function main(): void {
  const argv = process.argv.slice(2)
  const families = rowFamiliesOf(argv)
  const judged = families.includes('purchase') ? judgeRowLines(measureRows(filterOf(argv))) : []
  const vfx = families.includes('vfx') ? measureVfxRows(vfxFilterOf(argv)) : []
  const table = tablesOf(judged, vfx)
  writeResults([...judged, ...vfx], table)
  for (const line of judged) console.log(JSON.stringify({ ...line, judged: true }))
  console.log(`\n${table}`)
}

main()
