/**
 * Where the dynamite acts run dry, as `balance:charges` prints it (ticket 296; the GD ruling on
 * #237 Q1, its amendment and Content's correction): report only, Horizontal.
 *
 * - Scope: the planets whose act has a dynamite-class family (Foothold and Fire, and their endless
 *   repeats: P41, P45, P46, P50 … on today's cycle), read from each act's families by the
 *   mining-gates census, never a planet list. Every other planet reads n/a, not 0: rig-gated acts
 *   are dry by design.
 * - Dry run: per seed, the longest run of consecutive in-scope planets with no dynamite-gated
 *   cells. A run longer than 2 is flagged as data for Systems; a pace pass fixes it, not this
 *   report.
 * - Zero cells: an in-scope planet with none on any seed is a content finding.
 */

/** The longest dry run a seed may show before it is flagged (GD ruling on #237 Q1). */
export const MAX_DRY_RUN = 2

/** A planet's dynamite-gated tiles per seed, or null when its act has no dynamite family. */
export interface DynamiteScopePlanet {
  planet: number
  tilesBySeed: readonly number[] | null
}

/** A seed's longest run of consecutive dry in-scope planets; empty when none is dry. */
export interface DryRun {
  seed: number
  planets: readonly number[]
}

export function longestDryRunsOf(
  census: readonly DynamiteScopePlanet[],
  seeds: readonly number[],
): DryRun[] {
  return seeds.map((seed, at) => ({ seed, planets: longestDryRunOf(census, at) }))
}

export function dynamiteScopeTableOf(
  census: readonly DynamiteScopePlanet[],
  seeds: readonly number[],
): string {
  return [
    `| planet | dynamite act | ${seeds.map((seed) => `cells ${seed}`).join(' | ')} |`,
    `| --- | --- | ${seeds.map(() => '---').join(' | ')} |`,
    ...census.map(
      ({ planet, tilesBySeed }) =>
        `| ${planet} | ${tilesBySeed === null ? 'no' : 'yes'} | ${seeds.map((_seed, at) => tilesText(tilesBySeed, at)).join(' | ')} |`,
    ),
  ].join('\n')
}

export function dryRunTableOf(runs: readonly DryRun[]): string {
  return [
    `| seed | longest dry run | planets | at most ${MAX_DRY_RUN} |`,
    '| --- | --- | --- | --- |',
    ...runs.map(
      ({ seed, planets }) =>
        `| ${seed} | ${planets.length} | ${planets.length === 0 ? '-' : planets.join(', ')} | ${isTooLong(planets) ? 'no' : 'yes'} |`,
    ),
  ].join('\n')
}

/** Each seed's dry run over the cap, then each in-scope planet dry on every seed, a line each. */
export function dryRunWarnings(
  census: readonly DynamiteScopePlanet[],
  runs: readonly DryRun[],
): string[] {
  return [
    ...runs.filter(({ planets }) => isTooLong(planets)).map(tooLongLine),
    ...census.filter(isDryOnEverySeed).map(dryActLine),
  ]
}

/** In-scope planets in order, a seed's run of dry ones reset by each planet with cells. */
function longestDryRunOf(census: readonly DynamiteScopePlanet[], seedAt: number): number[] {
  let longest: number[] = []
  let current: number[] = []
  for (const { planet, tilesBySeed } of census) {
    if (tilesBySeed === null) continue
    current = tilesBySeed[seedAt] === 0 ? [...current, planet] : []
    if (current.length > longest.length) longest = current
  }
  return longest
}

function isTooLong(planets: readonly number[]): boolean {
  return planets.length > MAX_DRY_RUN
}

function tooLongLine({ seed, planets }: DryRun): string {
  return `seed ${seed}: ${planets.length} dynamite-act planets in a row with no dynamite cells (${planets.join(', ')}), data for Systems`
}

function isDryOnEverySeed({ tilesBySeed }: DynamiteScopePlanet): boolean {
  return tilesBySeed !== null && tilesBySeed.every((tiles) => tiles === 0)
}

function dryActLine({ planet }: DynamiteScopePlanet): string {
  return `planet ${planet}: a dynamite act with no dynamite cells on any seed (a content finding for Content and Planet)`
}

function tilesText(tilesBySeed: readonly number[] | null, seedAt: number): string {
  return tilesBySeed === null ? 'n/a' : String(tilesBySeed[seedAt])
}
