/**
 * Judges a planet's ore histograms against its mix (#141 acceptance 1): the seeds' tiles are
 * pooled per band and role, and each role's observed share must lie within its expected share
 * give or take #141's tolerance (±1.5 pp, ±1 pp where the weight is 0.03 or less), or within three
 * standard errors of the band's patch count where that is wider. Every patch rolls once (#141
 * "Rolls are per patch"), so a band of a hundred patches, as band 5 is on the small planets, cannot
 * resolve one percentage point; the bigger bands are held to #141's tolerance itself. A role the
 * mix lacks is always a problem, and the expected signature share never passes #140's band cap.
 * A rare role of a cluster planet (ticket 737) is judged on the band's patch rolls instead, and every
 * other role on the tiles the rare clusters leave (`mixHistogram.ts`, ticket 738).
 */
import { ORE_ROWS } from '../ores'
import {
  expectedSharesOf,
  paramsOfHistogram,
  SIGNATURE_ROLE,
  type BandHistogram,
  type ExpectedShare,
  type ObservedType,
  type PlanetHistogram,
  type RoleRolls,
} from './mixHistogram'

/** #141 acceptance 1: ±1.5 pp, ±1 pp where the weight is 0.03 or less. */
const TOLERANCE_BP = 150
const SMALL_WEIGHT_TOLERANCE_BP = 100
const SMALL_WEIGHT_BP = 300
/** Three standard errors, compared squared: 3² = 9. */
const STANDARD_ERRORS_SQUARED = 9
const BASIS_POINTS = 10000

interface PooledBand {
  band: number
  oreTiles: number
  patches: number
  /** Tiles per role. */
  roles: Map<string, number>
  /** Patch rolls per rare role of a cluster planet. */
  rolls: Map<string, number>
}

/** Why the seeds' histograms of one planet miss its mix; empty when they match. */
export function histogramProblems(histograms: readonly PlanetHistogram[]): string[] {
  if (histograms.length === 0) return []
  const [first] = histograms
  const expected = expectedSharesOf(paramsOfHistogram(first))
  return expected.flatMap((shares, at) =>
    bandProblems(`P${first.planetIndex} band ${at + 1}`, shares, pooledBandOf(histograms, at)),
  )
}

/**
 * One line per band: each type with its role, observed and expected share in basis points, then
 * each rare role's share of the patch rolls on a cluster planet.
 */
export function histogramLines(histogram: PlanetHistogram): string[] {
  const { planetIndex, worldSeed } = histogram
  const expected = expectedSharesOf(paramsOfHistogram(histogram))
  return histogram.bands.map((_, at) =>
    bandLine(`P${planetIndex} seed ${worldSeed}`, histogram, at, expected[at]),
  )
}

/** What the tile-judged roles share: the tiles the rare clusters leave, for the rolls they leave. */
interface TileScale {
  tilesLeft: number
  rollsLeftBp: number
}

function pooledBandOf(histograms: readonly PlanetHistogram[], at: number): PooledBand {
  const pooled: PooledBand = {
    band: at + 1,
    oreTiles: 0,
    patches: 0,
    roles: new Map(),
    rolls: new Map(),
  }
  for (const { bands } of histograms) addBand(pooled, bands[at])
  return pooled
}

function addBand(pooled: PooledBand, band: BandHistogram): void {
  pooled.oreTiles += band.oreTiles
  pooled.patches += band.patches
  for (const { role, tiles } of band.types)
    pooled.roles.set(role, (pooled.roles.get(role) ?? 0) + tiles)
  for (const { role, rolls } of band.rareRolls)
    pooled.rolls.set(role, (pooled.rolls.get(role) ?? 0) + rolls)
}

function bandProblems(
  where: string,
  expected: Map<string, ExpectedShare>,
  pooled: PooledBand,
): string[] {
  if (pooled.oreTiles === 0) return []
  const roles = new Set([...expected.keys(), ...pooled.roles.keys()])
  const scale = tileScaleOf(pooled, expected)
  return [...roles].flatMap((role) => {
    const observedBp = observedShareBpOf(pooled, expected, scale, role)
    const share = expected.get(role)
    if (share === undefined) return [`${where}: ${role} is not in the mix (${observedBp} bp)`]
    return [
      ...shareProblems(`${where}: ${role}`, observedBp, share, pooled.patches),
      ...signatureCapProblems(`${where}: ${role}`, role, share, pooled.band),
    ]
  })
}

/**
 * A role's share of the band's patch rolls where the mix judges it per roll; else its share of the
 * tiles the rare clusters leave, scaled to the part of the rolls the rare roles leave.
 */
function observedShareBpOf(
  pooled: PooledBand,
  expected: ReadonlyMap<string, ExpectedShare>,
  scale: TileScale,
  role: string,
): number {
  if (expected.get(role)?.isPerRoll === true)
    return shareBpOf(pooled.rolls.get(role) ?? 0, pooled.patches)
  return scaledTileShareBpOf(pooled.roles.get(role) ?? 0, scale)
}

/** Tiles as a share of the band's rolls: of the tiles the rare clusters leave, for the rolls left. */
function scaledTileShareBpOf(tiles: number, { tilesLeft, rollsLeftBp }: TileScale): number {
  return shareBpOf(tiles * rollsLeftBp, tilesLeft * BASIS_POINTS)
}

/** The tiles and rolls the tile-judged roles share: all of them on a planet without clusters. */
function tileScaleOf(pooled: PooledBand, expected: ReadonlyMap<string, ExpectedShare>): TileScale {
  const perRoll = perRollRolesOf(expected)
  return {
    tilesLeft: pooled.oreTiles - perRollTilesOf(pooled, perRoll),
    rollsLeftBp: BASIS_POINTS - perRollWeightBpOf(expected, perRoll),
  }
}

function perRollRolesOf(expected: ReadonlyMap<string, ExpectedShare>): string[] {
  return [...expected].filter(([, share]) => share.isPerRoll).map(([role]) => role)
}

/** The tiles the rare clusters paint, which the tile-judged roles' shares leave out. */
function perRollTilesOf(pooled: PooledBand, perRoll: readonly string[]): number {
  return perRoll.reduce((sum, role) => sum + (pooled.roles.get(role) ?? 0), 0)
}

/** The rare roles' part of the band's rolls; the plain mix's, as lava moves only the signature. */
function perRollWeightBpOf(
  expected: ReadonlyMap<string, ExpectedShare>,
  perRoll: readonly string[],
): number {
  return perRoll.reduce((sum, role) => sum + (expected.get(role)?.lowBp ?? 0), 0)
}

function shareProblems(
  where: string,
  observedBp: number,
  share: ExpectedShare,
  patches: number,
): string[] {
  const missBp = Math.max(share.lowBp - observedBp, observedBp - share.highBp, 0)
  const isWithin =
    missBp <= toleranceBpOf(share) || isWithinStandardErrors(missBp, share.highBp, patches)
  return isWithin ? [] : [`${where} ${observedBp} bp, expected ${rangeOf(share)}`]
}

function toleranceBpOf({ highBp }: ExpectedShare): number {
  return highBp <= SMALL_WEIGHT_BP ? SMALL_WEIGHT_TOLERANCE_BP : TOLERANCE_BP
}

/** `miss <= 3·sqrt(w(1-w)/n)`, squared so it stays in whole basis points. */
function isWithinStandardErrors(missBp: number, weightBp: number, patches: number): boolean {
  const variance = weightBp * (BASIS_POINTS - weightBp)
  return missBp * missBp * patches <= STANDARD_ERRORS_SQUARED * variance
}

function signatureCapProblems(where: string, role: string, share: ExpectedShare, band: number) {
  const capBp = ORE_ROWS.signatureShareCapBpByBand[String(band)] ?? 0
  const isOverCap = role === SIGNATURE_ROLE && share.highBp > capBp
  return isOverCap ? [`${where} may reach ${share.highBp} bp, over the cap ${capBp} bp`] : []
}

function bandLine(
  where: string,
  histogram: PlanetHistogram,
  at: number,
  expected: Map<string, ExpectedShare>,
): string {
  const { band, oreTiles, patches, types, rareRolls } = histogram.bands[at]
  const scale = tileScaleOf(pooledBandOf([histogram], at), expected)
  const head = `${where} b${band} ${oreTiles} tiles in ${patches} patches:`
  const typeCells = types.map((type) => typeCellOf(type, scale, expected.get(type.role)))
  const rollCells = rareRolls.map((rolls) => rollCellOf(rolls, patches, expected.get(rolls.role)))
  return [head, ...typeCells, ...rollCells].join(' ')
}

/** A type's share of the band, read on its tiles as a tile-judged role's is. */
function typeCellOf(type: ObservedType, scale: TileScale, share: ExpectedShare | undefined) {
  const observedBp = scaledTileShareBpOf(type.tiles, scale)
  return `${type.typeId} [${type.role}] ${observedBp} bp (${expectedTextOf(share)});`
}

/** A rare role of a cluster planet: its share of the band's patch rolls. */
function rollCellOf({ role, rolls }: RoleRolls, patches: number, share: ExpectedShare | undefined) {
  return `rolls [${role}] ${shareBpOf(rolls, patches)} bp (${expectedTextOf(share)});`
}

function expectedTextOf(share: ExpectedShare | undefined): string {
  if (share === undefined) return 'off mix'
  return share.isPerRoll ? `${rangeOf(share)} of rolls` : rangeOf(share)
}

function rangeOf({ lowBp, highBp }: ExpectedShare): string {
  const [low, high] = [Math.round(lowBp), Math.round(highBp)]
  return low === high ? `${low} bp` : `${low}-${high} bp`
}

function shareBpOf(tiles: number, oreTiles: number): number {
  return Math.round((tiles * BASIS_POINTS) / oreTiles)
}
