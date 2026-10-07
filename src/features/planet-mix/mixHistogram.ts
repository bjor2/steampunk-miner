/**
 * A planet's ore histogram per band, generated (#141 acceptance 1, `npm run ore:mix`): every ore
 * tile the patches paint, counted by its type and its role in the band (lead 0, +1, +2 or
 * signature; on the legacy planets P1 and P2 the role also names the family), beside the patches
 * the band holds and the share of its ore tiles the mix expects of each role. Shares are of the
 * band's ore tiles, as #141 has them: patches weighted by tiles. `histogramCheck.ts` judges them.
 *
 * On a heat planet a patch near lava doubles its signature share, so a role's expected share is the
 * range between the plain mix and the near-lava mix.
 */
import { resourceTierOf } from '../../systems/authority/minedOre'
import { generateChunkCells } from '../../systems/world/generateChunk'
import { orePatchesNearChunk } from '../../systems/world/orePatches'
import { bandOfTile, BAND_COUNT } from '../../systems/world/planetGeometry'
import { planetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import {
  CHUNK_CELLS,
  CHUNK_SIZE,
  chunkRangeOfDisc,
  firstTileOfChunk,
} from '../../systems/world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../../systems/world/worldCell'
import { familyOfCellCode, oreTierOf, oreTypeOf } from '../ores'
import { isMixedPlanet, oreMixNearLavaOf, oreMixOf, type OreMixEntry } from './systems/oreMix'
import { isSignatureOre } from './systems/signatureTag'

/** One ore type painted in a band, with its role and tile count. */
export interface ObservedType {
  typeId: string
  role: string
  tiles: number
}

export interface BandHistogram {
  band: number
  oreTiles: number
  /** Patches centred in the band that grew over at least one tile: the rolls behind the shares. */
  patches: number
  types: readonly ObservedType[]
}

export interface PlanetHistogram {
  planetIndex: number
  worldSeed: number
  bands: readonly BandHistogram[]
}

/** A role's expected share of its band's ore tiles, in basis points: plain mix to near lava. */
export interface ExpectedShare {
  lowBp: number
  highBp: number
}

export const SIGNATURE_ROLE = 'signature'

/** The planet's ore tiles per band, generated under the registrations in force. */
export function planetHistogramOf(planetIndex: number, worldSeed: number): PlanetHistogram {
  const params = planetParamsFor(worldSeed, planetIndex)
  const counts = Array.from({ length: BAND_COUNT }, () => new Map<string, ObservedType>())
  const patches = Array.from({ length: BAND_COUNT }, () => new Set<string>())
  for (const [cx, cy] of chunksOfDisc(params)) {
    countChunkOre(params, counts, cx, cy)
    notePatchesNearChunk(params, patches, cx, cy)
  }
  return {
    planetIndex,
    worldSeed,
    bands: counts.map((count, at) => bandHistogramOf(count, patches[at].size, at)),
  }
}

/** Each band's roles with the share the mix expects of them. */
export function expectedSharesOf(params: PlanetParams): Map<string, ExpectedShare>[] {
  const [plain, nearLava] = [oreMixOf(params), oreMixNearLavaOf(params)]
  return plain.bands.map((entries, at) =>
    sharesBetween(params, entries, nearLava.bands[at] ?? entries),
  )
}

function chunksOfDisc(params: PlanetParams): [number, number][] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const span = Array.from({ length: max - min + 1 }, (_, at) => min + at)
  return span.flatMap((cy) => span.map((cx): [number, number] => [cx, cy]))
}

function countChunkOre(
  params: PlanetParams,
  counts: Map<string, ObservedType>[],
  cx: number,
  cy: number,
): void {
  const cells = generateChunkCells(params, cx, cy)
  for (let index = 0; index < CHUNK_CELLS; index++) {
    if (kindOfCell(cells[index]) !== CELL_KIND.ore) continue
    const tx = firstTileOfChunk(cx) + (index % CHUNK_SIZE)
    const ty = firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE)
    const band = bandOfTile(params, tx, ty)
    countOreTile(params, counts[band - 1], band, cells[index])
  }
}

/** A patch shows up near every chunk it can touch, so it is kept once by its band and centre. */
function notePatchesNearChunk(
  params: PlanetParams,
  patches: Set<string>[],
  cx: number,
  cy: number,
): void {
  for (const { band, centre, tiles } of orePatchesNearChunk(params, cx, cy))
    if (tiles.length > 0) patches[band - 1].add(`${centre.tx},${centre.ty}`)
}

function countOreTile(
  params: PlanetParams,
  counts: Map<string, ObservedType>,
  band: number,
  cell: number,
): void {
  const tier = resourceTierOf(params, cell)
  const family = familyOfCellCode(familyOfCell(cell))?.id ?? 'unknown'
  const typeId = family === 'unknown' ? `unknown_t${tier}` : oreTypeOf(family, tier).id
  const kept = counts.get(typeId) ?? {
    typeId,
    role: observedRoleOf(params, band, family, tier),
    tiles: 0,
  }
  kept.tiles++
  counts.set(typeId, kept)
}

/** The role of a painted tile: signature, else its lead over the band it lies in. */
function observedRoleOf(params: PlanetParams, band: number, family: string, tier: number): string {
  if (isSignatureOre(family, tier)) return SIGNATURE_ROLE
  return leadRoleOf(params, family, tier - oreTierOf(params.planetIndex, band, 0))
}

function leadRoleOf(params: PlanetParams, family: string, lead: number): string {
  return isMixedPlanet(params.planetIndex) ? `+${lead}` : `${family} +${lead}`
}

function entryRoleOf(params: PlanetParams, entry: OreMixEntry): string {
  return entry.signature ? SIGNATURE_ROLE : leadRoleOf(params, entry.family, entry.lead)
}

function bandHistogramOf(
  counts: Map<string, ObservedType>,
  patches: number,
  at: number,
): BandHistogram {
  const types = [...counts.values()].sort((a, b) => b.tiles - a.tiles)
  const oreTiles = types.reduce((sum, type) => sum + type.tiles, 0)
  return { band: at + 1, oreTiles, patches, types }
}

function sharesBetween(
  params: PlanetParams,
  plain: readonly OreMixEntry[],
  nearLava: readonly OreMixEntry[],
): Map<string, ExpectedShare> {
  const [low, high] = [roleWeightsOf(params, plain), roleWeightsOf(params, nearLava)]
  const roles = new Set([...low.keys(), ...high.keys()])
  return new Map(
    [...roles].map((role) => {
      const [a, b] = [low.get(role) ?? 0, high.get(role) ?? 0]
      return [role, { lowBp: Math.min(a, b), highBp: Math.max(a, b) }]
    }),
  )
}

function roleWeightsOf(params: PlanetParams, entries: readonly OreMixEntry[]): Map<string, number> {
  const weights = new Map<string, number>()
  for (const entry of entries) {
    const role = entryRoleOf(params, entry)
    weights.set(role, (weights.get(role) ?? 0) + entry.weightBp)
  }
  return weights
}
