/**
 * A planet's ore histogram per band, generated (#141 acceptance 1, `npm run ore:mix`): every ore
 * tile the patches paint, counted by its type and its role in the band (lead 0, +1, +2 or
 * signature; on the legacy planets P1 and P2 the role also names the family), beside the patches
 * the band holds and the share of its ore tiles the mix expects of each role. Shares are of the
 * band's ore tiles, as #141 has them: patches weighted by tiles. `histogramCheck.ts` judges them.
 *
 * On a heat planet a patch near lava doubles its signature share, so a role's expected share is the
 * range between the plain mix and the near-lava mix. A histogram names the ore rules its planet was
 * generated under (ticket 445), so the check rebuilds the same mix.
 *
 * On a planet whose rare ore grows in clusters (ore rules 10, ticket 737), a rare patch paints 1 to
 * 3 cells of its patch and leaves the rest plain ground: rarity counts one roll per cluster and
 * money counts the cells. Its rare roles are then judged per roll, the band's patches that rolled
 * them, and every other role's share of the tiles the rare clusters leave, over what the rare rolls
 * leave of the mix (ticket 738, when the deep rows made the rare share big enough to tell).
 */
import { resourceTierOf } from '../../systems/authority/minedOre'
import { generateChunkCells } from '../../systems/world/generateChunk'
import { orePatchesNearChunk, type OrePatch } from '../../systems/world/orePatches'
import { patchCellOf } from '../../systems/world/patchCell'
import { bandOfTile, BAND_COUNT } from '../../systems/world/planetGeometry'
import {
  freshPlanetParamsFor,
  isRareClusterPlanet,
  planetParamsFor,
  type PlanetParams,
} from '../../systems/world/planetParams'
import { RARE_CLUSTER_FIRST_LEAD } from '../../systems/world/planetTable'
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

/** The band's patches that rolled a rare role on a cluster planet (ticket 737): judged per roll. */
export interface RoleRolls {
  role: string
  rolls: number
}

export interface BandHistogram {
  band: number
  oreTiles: number
  /** Patches centred in the band that grew over at least one tile: the rolls behind the shares. */
  patches: number
  types: readonly ObservedType[]
  /** On a cluster planet, the rare roles' rolls; empty elsewhere. */
  rareRolls: readonly RoleRolls[]
}

export interface PlanetHistogram {
  planetIndex: number
  worldSeed: number
  /** The ore rules the planet was generated under; absent on the legacy rows. */
  oreRulesVersion?: number
  bands: readonly BandHistogram[]
}

/**
 * A role's expected share of its band's ore tiles, in basis points: plain mix to near lava. A rare
 * role of a cluster planet is a share of the band's patch rolls instead (`isPerRoll`); the check
 * reads every other role on the tiles the rare clusters leave, over what the rare rolls leave.
 */
export interface ExpectedShare {
  lowBp: number
  highBp: number
  isPerRoll: boolean
}

export const SIGNATURE_ROLE = 'signature'

/** The ore tiles per band of the planet as this build enters it fresh. */
export function planetHistogramOf(planetIndex: number, worldSeed: number): PlanetHistogram {
  return planetHistogramOfParams(freshPlanetParamsFor(worldSeed, planetIndex))
}

/** The planet's ore tiles per band, generated under the registrations in force. */
export function planetHistogramOfParams(params: PlanetParams): PlanetHistogram {
  const counts = Array.from({ length: BAND_COUNT }, () => new Map<string, ObservedType>())
  const patches = Array.from({ length: BAND_COUNT }, () => new Map<string, string | null>())
  for (const [cx, cy] of chunksOfDisc(params)) {
    countChunkOre(params, counts, cx, cy)
    notePatchesNearChunk(params, patches, cx, cy)
  }
  return {
    planetIndex: params.planetIndex,
    worldSeed: params.worldSeed,
    ...(params.oreRulesVersion === undefined ? {} : { oreRulesVersion: params.oreRulesVersion }),
    bands: counts.map((count, at) => bandHistogramOf(count, patches[at], at)),
  }
}

/** The params a histogram's planet was generated with. */
export function paramsOfHistogram(histogram: PlanetHistogram): PlanetParams {
  const { worldSeed, planetIndex, oreRulesVersion } = histogram
  return planetParamsFor(worldSeed, planetIndex, oreRulesVersion)
}

/** Each band's roles with the share the mix expects of them. */
export function expectedSharesOf(params: PlanetParams): Map<string, ExpectedShare>[] {
  const [plain, nearLava] = [oreMixOf(params), oreMixNearLavaOf(params)]
  return plain.bands.map((entries, at) =>
    sharesBetween(params, entries, nearLava.bands[at] ?? entries),
  )
}

/** Whether a role is judged per roll: a rare lead on a planet whose rare ore grows in clusters. */
function isPerRollRole(params: PlanetParams, lead: number, isSignature: boolean): boolean {
  return isRareClusterPlanet(params) && !isSignature && lead >= RARE_CLUSTER_FIRST_LEAD
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

/**
 * A patch shows up near every chunk it can touch, so it is kept once by its band and centre, with
 * the rare role it rolled on a cluster planet (null for any other).
 */
function notePatchesNearChunk(
  params: PlanetParams,
  patches: Map<string, string | null>[],
  cx: number,
  cy: number,
): void {
  for (const patch of orePatchesNearChunk(params, cx, cy)) {
    const key = `${patch.centre.tx},${patch.centre.ty}`
    const known = patches[patch.band - 1]
    if (patch.tiles.length > 0 && !known.has(key)) known.set(key, perRollRoleOf(params, patch))
  }
}

/** The rare role a patch rolled, as its cell reads; null where its role is judged by tiles. */
function perRollRoleOf(params: PlanetParams, patch: OrePatch): string | null {
  const cell = patchCellOf(params, patch)
  const tier = resourceTierOf(params, cell)
  const lead = tier - oreTierOf(params.planetIndex, patch.band, 0)
  const family = familyOfCellCode(familyOfCell(cell))?.id ?? 'unknown'
  const isSignature = isSignatureOre(family, tier)
  if (!isPerRollRole(params, lead, isSignature)) return null
  return leadRoleOf(params, family, lead)
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
  patches: ReadonlyMap<string, string | null>,
  at: number,
): BandHistogram {
  const types = [...counts.values()].sort((a, b) => b.tiles - a.tiles)
  const oreTiles = types.reduce((sum, type) => sum + type.tiles, 0)
  return { band: at + 1, oreTiles, patches: patches.size, types, rareRolls: rollsOf(patches) }
}

function rollsOf(patches: ReadonlyMap<string, string | null>): RoleRolls[] {
  const rolls = new Map<string, number>()
  for (const role of patches.values())
    if (role !== null) rolls.set(role, (rolls.get(role) ?? 0) + 1)
  return [...rolls].map(([role, count]) => ({ role, rolls: count }))
}

function sharesBetween(
  params: PlanetParams,
  plain: readonly OreMixEntry[],
  nearLava: readonly OreMixEntry[],
): Map<string, ExpectedShare> {
  const [low, high] = [roleWeightsOf(params, plain), roleWeightsOf(params, nearLava)]
  const perRoll = perRollRolesOf(params, [...plain, ...nearLava])
  const roles = new Set([...low.keys(), ...high.keys()])
  return new Map(
    [...roles].map((role) => {
      const [a, b] = [low.get(role) ?? 0, high.get(role) ?? 0]
      return [role, { lowBp: Math.min(a, b), highBp: Math.max(a, b), isPerRoll: perRoll.has(role) }]
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

function perRollRolesOf(params: PlanetParams, entries: readonly OreMixEntry[]): Set<string> {
  const perRoll = entries.filter((entry) => isPerRollRole(params, entry.lead, entry.signature))
  return new Set(perRoll.map((entry) => entryRoleOf(params, entry)))
}
