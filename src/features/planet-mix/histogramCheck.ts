/**
 * Judges a planet's ore histograms against its mix (#141 acceptance 1): the seeds' tiles are
 * pooled per band and role, and each role's observed share must lie within its expected share
 * give or take #141's tolerance (±1.5 pp, ±1 pp where the weight is 0.03 or less), or within three
 * standard errors of the band's patch count where that is wider. Every patch rolls once (#141
 * "Rolls are per patch"), so a band of a hundred patches, as band 5 is on the small planets, cannot
 * resolve one percentage point; the bigger bands are held to #141's tolerance itself. A role the
 * mix lacks is always a problem, and the expected signature share never passes #140's band cap.
 */
import { planetParamsFor } from '../../systems/world/planetParams'
import { ORE_ROWS } from '../ores'
import {
  expectedSharesOf,
  SIGNATURE_ROLE,
  type BandHistogram,
  type ExpectedShare,
  type ObservedType,
  type PlanetHistogram,
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
  roles: Map<string, number>
}

/** Why the seeds' histograms of one planet miss its mix; empty when they match. */
export function histogramProblems(histograms: readonly PlanetHistogram[]): string[] {
  if (histograms.length === 0) return []
  const [{ planetIndex, worldSeed }] = histograms
  const expected = expectedSharesOf(planetParamsFor(worldSeed, planetIndex))
  return expected.flatMap((shares, at) =>
    bandProblems(`P${planetIndex} band ${at + 1}`, shares, pooledBandOf(histograms, at)),
  )
}

/** One line per band: each type with its role, observed and expected share in basis points. */
export function histogramLines(histogram: PlanetHistogram): string[] {
  const { planetIndex, worldSeed } = histogram
  const expected = expectedSharesOf(planetParamsFor(worldSeed, planetIndex))
  return histogram.bands.map((band, at) =>
    bandLine(`P${planetIndex} seed ${worldSeed}`, band, expected[at]),
  )
}

function pooledBandOf(histograms: readonly PlanetHistogram[], at: number): PooledBand {
  const pooled: PooledBand = { band: at + 1, oreTiles: 0, patches: 0, roles: new Map() }
  for (const { bands } of histograms) addBand(pooled, bands[at])
  return pooled
}

function addBand(pooled: PooledBand, band: BandHistogram): void {
  pooled.oreTiles += band.oreTiles
  pooled.patches += band.patches
  for (const { role, tiles } of band.types)
    pooled.roles.set(role, (pooled.roles.get(role) ?? 0) + tiles)
}

function bandProblems(
  where: string,
  expected: Map<string, ExpectedShare>,
  pooled: PooledBand,
): string[] {
  if (pooled.oreTiles === 0) return []
  const roles = new Set([...expected.keys(), ...pooled.roles.keys()])
  return [...roles].flatMap((role) => {
    const observedBp = shareBpOf(pooled.roles.get(role) ?? 0, pooled.oreTiles)
    const share = expected.get(role)
    if (share === undefined) return [`${where}: ${role} is not in the mix (${observedBp} bp)`]
    return [
      ...shareProblems(`${where}: ${role}`, observedBp, share, pooled.patches),
      ...signatureCapProblems(`${where}: ${role}`, role, share, pooled.band),
    ]
  })
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
  { band, oreTiles, patches, types }: BandHistogram,
  expected: Map<string, ExpectedShare>,
): string {
  const head = `${where} b${band} ${oreTiles} tiles in ${patches} patches:`
  return [head, ...types.map((type) => typeCellOf(type, oreTiles, expected.get(type.role)))].join(
    ' ',
  )
}

function typeCellOf(type: ObservedType, oreTiles: number, share: ExpectedShare | undefined) {
  const range = share === undefined ? 'off mix' : rangeOf(share)
  return `${type.typeId} [${type.role}] ${shareBpOf(type.tiles, oreTiles)} bp (${range});`
}

function rangeOf({ lowBp, highBp }: ExpectedShare): string {
  const [low, high] = [Math.round(lowBp), Math.round(highBp)]
  return low === high ? `${low} bp` : `${low}-${high} bp`
}

function shareBpOf(tiles: number, oreTiles: number): number {
  return Math.round((tiles * BASIS_POINTS) / oreTiles)
}
