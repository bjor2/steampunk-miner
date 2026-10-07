/**
 * Where dynamite gates can be judged (GD ruling on ticket 237, with Systems' and Content's
 * guardrails): a planet's dynamite-gated ore tiles on one seed, from #141's generated histogram
 * and the band's gate table, and whether the planet's act shows a dynamite family at all.
 * `balance:charges` judges the bot's dynamite clears only on planets where at least two seeds have
 * such tiles, and flags a dynamite act with none on any seed as a content finding. The act test
 * reads the act's families, never a planet list, so it holds if the endless cycle is reordered.
 */
import {
  actOf,
  gateClassOf,
  type BandHistogram,
  type OreAct,
  type PlanetHistogram,
} from '../../planet-mix'
import type { GatedEntry, GateTable } from './gateTable'

/** The `gateClass` #141 gives the families whose ore a charge frees. */
const DYNAMITE_GATE_CLASS = 'dynamite'

/** The generated ore tiles whose band's gate table seals them in a dynamite shell. */
export function dynamiteTilesOf(histogram: PlanetHistogram, table: GateTable): number {
  return histogram.bands.reduce(
    (tiles, band) => tiles + dynamiteTilesInBand(band, table.bands[band.band - 1] ?? []),
    0,
  )
}

/** The planet's act has a family of the dynamite gate class (Foothold and Fire on main). */
export function isDynamiteAct(planetIndex: number): boolean {
  return familiesOfAct(actOf(planetIndex)).some(
    (family) => gateClassOf(family) === DYNAMITE_GATE_CLASS,
  )
}

function dynamiteTilesInBand(band: BandHistogram, gated: readonly GatedEntry[]): number {
  const sealed = new Set(
    gated.filter(({ gate }) => gate.kind === 'dynamite').map(({ entry }) => entry.typeId),
  )
  return band.types
    .filter((type) => sealed.has(type.typeId))
    .reduce((tiles, type) => tiles + type.tiles, 0)
}

function familiesOfAct(act: OreAct): string[] {
  return [...(act.commons ?? []), act.rare, act.signature].filter(
    (family): family is string => family !== null,
  )
}
