/**
 * The loader guards of the signature skin rows (ticket 603 under #576): a row names a planet that
 * paints a signature material on a species pool (`signatureMaterial.ts`), a planet's signature
 * wears one skin, every layer id is in its list, and the palette's body keeps the family's look.
 * That no signature shares all four layers with a species of its planet is the table's pool guard.
 */
import { signatureBodyProblems, type PaletteRamp } from './paletteRamps'
import type { SignatureMaterial } from './signatureMaterial'
import { SKIN_LAYER_KINDS, type SignatureSkinRow, type SkinLayerKind } from './skinLayers'

export interface SignatureGuardTable {
  layers: Readonly<Record<SkinLayerKind, readonly string[]>>
  signatures: readonly SignatureSkinRow[]
  ramps: ReadonlyMap<string, PaletteRamp>
}

export function signatureSkinProblems(
  table: SignatureGuardTable,
  signatureByPlanet: ReadonlyMap<number, SignatureMaterial>,
): string[] {
  return [
    ...unsignedPlanetProblems(table.signatures, signatureByPlanet),
    ...twoSignatureSkinProblems(table.signatures),
    ...unknownSignatureLayerProblems(table),
    ...signatureBodyProblems(table.signatures, table.ramps, signatureByPlanet),
  ]
}

function unsignedPlanetProblems(
  rows: readonly SignatureSkinRow[],
  signatureByPlanet: ReadonlyMap<number, SignatureMaterial>,
): string[] {
  return rows
    .filter((row) => !signatureByPlanet.has(row.planet))
    .map((row) => `a signature skin names planet ${row.planet}, which paints no pooled signature`)
}

function twoSignatureSkinProblems(rows: readonly SignatureSkinRow[]): string[] {
  const planets = rows.map((row) => row.planet)
  return planets
    .filter((planet, at) => planets.indexOf(planet) !== at)
    .map((planet) => `the signature of planet ${planet} wears two skins; it has one`)
}

function unknownSignatureLayerProblems(table: SignatureGuardTable): string[] {
  return table.signatures.flatMap((row) =>
    SKIN_LAYER_KINDS.filter((kind) => !table.layers[kind].includes(row[kind])).map(
      (kind) =>
        `the signature of planet ${row.planet} names the ${kind} ${row[kind]}, which layers.${kind} lacks`,
    ),
  )
}
