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
}

/** A run with the kinds it is split into. */
export interface SplitRun extends PaintedRun {
  kinds: number
}

/** The mix's non-signature runs, rarest last, each lead's runs by first band, then family id. */
export function paintedRunsOf(mix: OreMix): PaintedRun[] {
  const runs = new Map<string, PaintedRun>()
  mix.bands.forEach((entries, at) => {
    for (const entry of entries.filter(isKindedEntry)) foldEntryInto(runs, entry, at + 1)
  })
  return [...runs.values()].sort(compareRuns)
}

/** One kind a run, then one more to the run with the heaviest kinds until `kindsTarget`. */
export function splitRunsOf(runs: readonly PaintedRun[], kindsTarget: number): SplitRun[] {
  const split = runs.map((run) => ({ ...run, kinds: 1 }))
  for (let held = split.length; held < kindsTarget && split.length > 0; held += 1) {
    heaviestKindsRunOf(split).kinds += 1
  }
  return split
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
