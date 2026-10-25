/**
 * The runs a generated material pool is cut from (ticket 777, spec #774): every family the planet's
 * ore mix paints at one rarity lead, with the first and last band it paints it in and its weight
 * summed over those bands. A kind is only ever drawn on cells of its family at its lead (the ores
 * slice's slot rule), so a pool cut from these runs holds no kind the planet never paints. The
 * signature entries stay kindless, as on every first-system pool (no slot names the signature).
 *
 * The runs are split into kinds until the planet holds `kindsTarget`: each split goes to the run
 * whose kinds carry the most patch weight each, so the heaviest commons split first, as the first
 * system's mixed table holds two kinds per common family. Integer only.
 *
 * A run first holds the least kinds the VS's per-kind bounds of a band trip ask for (ticket 446's
 * family-first guard, 6226198316: a common kind at most 5000 bp of a band trip, any other kind at
 * most 1500 bp; ticket 888): in each band it is painted in, its cell's patch weight and its value
 * share of the band, each over the bound, rounded up. So a swapped band 3, whose fossil common
 * paints nearly the whole band, splits that common in two, as the first system's Option B rows do
 * (#453), and the pool grows past the target to hold it, never past the roster cap.
 */
import type { OreMix, OreMixEntry } from '../../planet-mix'

/** One family at one rarity lead that the mix paints. */
export interface PaintedRun {
  family: string
  lead: number
  /** The first and last band the mix paints the run in. */
  window: readonly [number, number]
  /** The run's weight summed over its bands, in basis points of each band's patches. */
  weightBp: number
  /** The fewest kinds the run's cells need to keep each kind within its band-trip bound. */
  leastKinds: number
}

/** A run with the kinds it is split into. */
export interface SplitRun extends PaintedRun {
  kinds: number
}

/** The VS's bounds on one kind's share of a band trip, in basis points (ticket 446). */
export interface KindTripCaps {
  commonBp: number
  otherBp: number
}

/** One (family, lead) cell of a band: every entry of it, the signature's share included. */
interface BandCell {
  family: string
  lead: number
  weightBp: number
  /** `weightBp x 3^lead x 2^(top - lead)`: its value over the band's, in whole numbers. */
  value: number
}

const BASIS_POINTS = 10000
const VALUE_RATIO_NUMERATOR = 3
const VALUE_RATIO_DENOMINATOR = 2

/** The mix's non-signature runs, rarest last, each lead's runs by first band, then family id. */
export function paintedRunsOf(mix: OreMix, caps: KindTripCaps): PaintedRun[] {
  const runs = new Map<string, PaintedRun>()
  mix.bands.forEach((entries, at) => {
    for (const entry of entries.filter(isKindedEntry)) foldEntryInto(runs, entry, at + 1)
  })
  return [...runs.values()].sort(compareRuns).map((run) => withLeastKinds(run, mix, caps))
}

/**
 * Each run's least kinds, then one more to the run with the heaviest kinds until `kindsTarget`;
 * the least kinds alone may pass the target.
 */
export function splitRunsOf(runs: readonly PaintedRun[], kindsTarget: number): SplitRun[] {
  const split = runs.map((run) => ({ ...run, kinds: run.leastKinds }))
  let held = split.reduce((sum, run) => sum + run.kinds, 0)
  for (; held < kindsTarget && split.length > 0; held += 1) heaviestKindsRunOf(split).kinds += 1
  return split
}

function withLeastKinds(run: PaintedRun, mix: OreMix, caps: KindTripCaps): PaintedRun {
  const cap = run.lead === 0 ? caps.commonBp : caps.otherBp
  const inBands = mix.bands.map((entries) => leastKindsInBand(run, bandCellsOf(entries), cap))
  return { ...run, leastKinds: Math.max(1, ...inBands) }
}

/** The kinds the run's cell needs in one band: its weight and its value share, over the cap. */
function leastKindsInBand(run: PaintedRun, cells: readonly BandCell[], cap: number): number {
  const cell = cells.find((candidate) => isCellOfRun(candidate, run))
  if (cell === undefined) return 0
  const bandValue = cells.reduce((sum, candidate) => sum + candidate.value, 0)
  const byWeight = ceilDivision(cell.weightBp, cap)
  const byValue = ceilDivision(cell.value * BASIS_POINTS, bandValue * cap)
  return Math.max(byWeight, byValue)
}

function bandCellsOf(entries: readonly OreMixEntry[]): BandCell[] {
  const top = Math.max(0, ...entries.map((entry) => entry.lead))
  const cells = new Map<string, BandCell>()
  for (const entry of entries) {
    const key = `${entry.family}+${entry.lead}`
    const held = cells.get(key)
    const weightBp = (held?.weightBp ?? 0) + entry.weightBp
    cells.set(key, { family: entry.family, lead: entry.lead, weightBp, value: 0 })
  }
  return [...cells.values()].map((cell) => ({ ...cell, value: valueOf(cell, top) }))
}

function valueOf(cell: Pick<BandCell, 'weightBp' | 'lead'>, top: number): number {
  return (
    cell.weightBp *
    VALUE_RATIO_NUMERATOR ** cell.lead *
    VALUE_RATIO_DENOMINATOR ** (top - cell.lead)
  )
}

function isCellOfRun(cell: BandCell, run: PaintedRun): boolean {
  return cell.family === run.family && cell.lead === run.lead
}

function ceilDivision(numerator: number, denominator: number): number {
  return Math.ceil(numerator / denominator)
}

function isKindedEntry(entry: OreMixEntry): boolean {
  return !entry.signature && entry.weightBp > 0
}

function foldEntryInto(runs: Map<string, PaintedRun>, entry: OreMixEntry, band: number): void {
  const key = `${entry.family}+${entry.lead}`
  const held = runs.get(key) ?? {
    family: entry.family,
    lead: entry.lead,
    window: [band, band],
    weightBp: 0,
    leastKinds: 1,
  }
  runs.set(key, {
    ...held,
    window: [held.window[0], band],
    weightBp: held.weightBp + entry.weightBp,
  })
}

/** The first run whose kinds carry the most weight each, compared without division. */
function heaviestKindsRunOf(runs: readonly SplitRun[]): SplitRun {
  return runs.reduce((heaviest, run) =>
    run.weightBp * heaviest.kinds > heaviest.weightBp * run.kinds ? run : heaviest,
  )
}

function compareRuns(a: PaintedRun, b: PaintedRun): number {
  if (a.lead !== b.lead) return a.lead - b.lead
  if (a.window[0] !== b.window[0]) return a.window[0] - b.window[0]
  return a.family < b.family ? -1 : a.family > b.family ? 1 : 0
}
