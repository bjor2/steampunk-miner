/**
 * The explosion rows of `bench:purchase-levels` (D8 ticket 868, the TD's bench row): sizes 1, 6
 * and 12 × Blast Radius levels 0, 10 and 1e6 × 360 px, 1280×800 and 1920×1080, each one blast
 * played through the dynamite-visuals slice's real front pools and timed a frame at a time by the
 * slice's `benchBlast` debug action (`scene/blastVfxBench.ts`), so this script imports no slice.
 * Measured, never gated: a red row is a VFX finding under #647.
 */
import { debugActionsBySlice } from '../../src/debug/debugActionRegistry'
import { PROFILES } from './purchaseLevelRows'

export const VFX_SIZES = [1, 6, 12] as const
export const VFX_LEVELS = [0, 10, 1_000_000] as const

/** The ticket's three screens; the phone's CPU is the perf:phone lane's slowdown (#840). */
export interface VfxScreen {
  name: 'phone360' | 'desktop1280x800' | 'desktop1920x1080'
  shortAxisPixels: number
  cpuSlowdown: number
}

const PHONE_SLOWDOWN = PROFILES.find((profile) => profile.name === 'phone')?.cpuSlowdown ?? 1

export const VFX_SCREENS: readonly VfxScreen[] = [
  { name: 'phone360', shortAxisPixels: 360, cpuSlowdown: PHONE_SLOWDOWN },
  { name: 'desktop1280x800', shortAxisPixels: 800, cpuSlowdown: 1 },
  { name: 'desktop1920x1080', shortAxisPixels: 1080, cpuSlowdown: 1 },
]

export interface VfxRow {
  size: number
  level: number
  screen: VfxScreen
}

export interface VfxRowFilter {
  sizes: readonly string[] | null
  levels: readonly string[] | null
  screens: readonly string[] | null
}

/** What the slice's action answers for one row. */
export interface VfxRowLine {
  bench: 'blastVfx'
  row: string
  band: number
  frames: number
  frameMsP50: number
  frameMsP95: number
  frameMsMax: number
  frameBudgetMs: number
  piecesThrown: number
  shockwavePx: number
  fireballPx: number
  flashFrames: number
  failures: string[]
}

export function vfxRowsOf(filter: VfxRowFilter): VfxRow[] {
  const sizes = VFX_SIZES.filter((size) => isKept(filter.sizes, String(size)))
  const levels = VFX_LEVELS.filter((level) => isKept(filter.levels, String(level)))
  const screens = VFX_SCREENS.filter((screen) => isKept(filter.screens, screen.name))
  return sizes.flatMap((size) =>
    levels.flatMap((level) => screens.map((screen) => ({ size, level, screen }))),
  )
}

function isKept(kept: readonly string[] | null, name: string): boolean {
  return kept === null || kept.includes(name)
}

/** Plays the row through the slice's `benchBlast` action; the loader must have run. */
export function runVfxRow(row: VfxRow): VfxRowLine {
  const benchBlast = debugActionsBySlice()['dynamite-visuals']?.benchBlast
  if (benchBlast === undefined) throw new Error('the dynamite-visuals slice is not loaded')
  const result = benchBlast(row.size, row.level, row.screen)
  if (!result.ok) throw new Error(result.problems.join('; '))
  return (result as unknown as { line: VfxRowLine }).line
}

const VFX_TABLE_HEADER = [
  'row',
  'band',
  'frames',
  'vfx ms p50/p95 (max)',
  'pieces',
  'shockwave px',
  'fireball px',
  'flash',
  'fails',
]

export function vfxTableOf(lines: readonly VfxRowLine[]): string {
  const rule = VFX_TABLE_HEADER.map(() => '---')
  return [VFX_TABLE_HEADER, rule, ...lines.map(vfxCellsOf)]
    .map((cells) => `| ${cells.join(' | ')} |`)
    .join('\n')
}

function vfxCellsOf(line: VfxRowLine): string[] {
  return [
    line.row,
    String(line.band),
    String(line.frames),
    `${line.frameMsP50} / ${line.frameMsP95} (${line.frameMsMax})`,
    String(line.piecesThrown),
    String(line.shockwavePx),
    String(line.fireballPx),
    `${line.flashFrames}f`,
    line.failures.length === 0 ? 'none' : line.failures.join(', '),
  ]
}
