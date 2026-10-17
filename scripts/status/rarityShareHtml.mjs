// The Performance tab's Rarity shares panel (ticket 449): the materials' share bounds Systems set on
// #139 (6203159815, the per-tier bound 650 bp since 6203640346), per judged planet and band, the
// worst over the pacing seeds, each beside its bound, and the #385 income cap at the on-curve
// vehicle over the rarity-weighted full hold beside the nominal one. Rendered at build time from
// docs/economy/rarity-shares.json (`npm run rarity:shares`), so the page shows what main holds.
import { escapeHtml } from './perfOverviewHtml.mjs'

const TIER_ORDER = ['uncommon', 'rare', 'epic', 'mythic', 'signature']

/** Basis points as a percent with two decimals: 1500 reads 15.00%. */
export function percentOfBasisPoints(basisPoints) {
  return `${(basisPoints / 100).toFixed(2)}%`
}

/** A cell, red when it is over its bound. */
function cellOf(text, isOver = false) {
  return `<td class="${isOver ? 'bad' : ''}">${escapeHtml(text)}</td>`
}

/** A share against its bound; a planet without a roster has none to show. */
function boundedCellOf(value, limit) {
  return value === null ? cellOf('—') : cellOf(String(value), value > limit)
}

function tiersTextOf(tiers) {
  return TIER_ORDER.filter((id) => tiers?.[id] !== undefined)
    .map((id) => `${id} ${tiers[id]}`)
    .join(' · ')
}

function worstTierOf(tiers) {
  return Math.max(0, ...Object.values(tiers ?? {}))
}

function bandRowOf(planet, band, bounds) {
  const boosted = band.boostedTiersBp
    ? `<div class="muted">story boost: ${escapeHtml(tiersTextOf(band.boostedTiersBp))}, mean ${escapeHtml(band.boostedMeanShiftBp)} bp</div>`
    : ''
  const isTierOver = worstTierOf(band.tiersBp) > bounds.perNonCommonTierMax
  const commons = band.fewestLiveCommons
  return [
    '<tr>',
    `<td>P${planet.planet}</td><td>${band.band}</td>`,
    `<td class="${isTierOver ? 'bad' : ''}">${escapeHtml(tiersTextOf(band.tiersBp)) || '—'}${boosted}</td>`,
    boundedCellOf(band.worstCommonKindBp, bounds.perCommonKindMaxOfBandTrip),
    boundedCellOf(band.worstOtherKindBp, bounds.perNonCommonKindMax),
    commons === null
      ? cellOf('—')
      : cellOf(String(commons), commons < bounds.liveCommonsPerBandMin),
    cellOf(band.meanShiftBp, Math.abs(Number(band.meanShiftBp)) >= bounds.meanShiftMaxBp),
    cellOf(percentOfBasisPoints(band.cvBp), band.cvBp > bounds.cvMaxBp),
    cellOf(ratioText(band.p999OfExpectedBp), band.p999OfExpectedBp > bounds.p999MaxOfNominalBp),
    boundedCellOf(band.worstEpicAndMythicTripBp, bounds.epicPlusMythicTripClampBp),
    cellOf(band.clampLossBp, Number(band.clampLossBp) > bounds.clampLossMaxBp),
    '</tr>',
  ].join('')
}

/** Basis points of a whole as a ratio with four decimals: 11200 reads 1.1200. */
function ratioText(basisPoints) {
  return (basisPoints / 10000).toFixed(4)
}

function planetRowsOf(planet, bounds) {
  return planet.bands.map((band) => bandRowOf(planet, band, bounds)).join('')
}

function planetSummaryOf(planet, bounds) {
  const kinds = planet.hasRoster
    ? `worst common kind ${planet.worstCommonKindOfPlanetBp} bp of the planet (≤ ${bounds.perCommonKindMaxOfPlanet}), other ${planet.worstOtherKindOfPlanetBp} bp (≤ ${bounds.perNonCommonKindMax})`
    : 'no roster yet: no kind to bound'
  const missed =
    planet.violations.length === 0 ? 'every bound holds' : `${planet.violations.length} missed`
  return `<li>P${planet.planet}, hold ${planet.hold}: ${escapeHtml(kinds)}; ${escapeHtml(missed)}</li>`
}

function incomeCapRowOf(row) {
  return [
    '<tr>',
    `<td>P${row.planet}</td><td>${escapeHtml(row.item)}</td>`,
    `<td class="${row.isFailing ? 'bad' : ''}">${percentOfBasisPoints(row.shareBp)}</td>`,
    `<td>${percentOfBasisPoints(row.nominalShareBp)}</td>`,
    `<td>${percentOfBasisPoints(row.unclampedBp)}</td>`,
    '</tr>',
  ].join('')
}

function violationsOf(table) {
  const lines = table.planets.flatMap((planet) => planet.violations)
  if (lines.length === 0)
    return '<p class="ok">Every bound holds on every judged planet and seed.</p>'
  return `<ul class="bad">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
}

/** The panel; `table` is the parsed docs/economy/rarity-shares.json. */
export function renderRarityShares(table) {
  const { bounds } = table
  return [
    '<section class="panel" id="rarity-shares-panel">',
    '<h2>Rarity shares <span class="muted">(ticket 449, Systems on #139)</span></h2>',
    `<p class="muted">Worst over seeds ${escapeHtml(table.seeds.join(', '))}, in basis points of a band trip. Tiers and means on Systems' model (base signature share); kinds where the planet has a roster. Red is over the bound.</p>`,
    violationsOf(table),
    `<ul class="list">${table.planets.map((planet) => planetSummaryOf(planet, bounds)).join('')}</ul>`,
    '<table id="rarity-shares-table"><thead><tr>',
    `<th>Planet</th><th>Band</th><th>Tiers (≤ ${bounds.perNonCommonTierMax})</th><th>Common kind (≤ ${bounds.perCommonKindMaxOfBandTrip})</th><th>Other kind (≤ ${bounds.perNonCommonKindMax})</th><th>Live commons (≥ ${bounds.liveCommonsPerBandMin})</th><th>Mean vs today, bp (&lt; ${bounds.meanShiftMaxBp})</th><th>Trip CV (≤ ${percentOfBasisPoints(bounds.cvMaxBp)})</th><th>p99.9 / expected (≤ ${ratioText(bounds.p999MaxOfNominalBp)})</th><th>Epic+mythic in a trip (≤ ${bounds.epicPlusMythicTripClampBp})</th><th>Clamp cost, bp (≤ ${bounds.clampLossMaxBp})</th>`,
    '</tr></thead><tbody>',
    table.planets.map((planet) => planetRowsOf(planet, bounds)).join(''),
    '</tbody></table>',
    '<h2>#385 income cap, rarity-weighted <span class="muted">(band 5, on-curve vehicle, every item owned)</span></h2>',
    '<table id="rarity-income-cap-table"><thead><tr><th>Planet</th><th>Income item</th><th>Trip share, cargo × V(t) × μ</th><th>Nominal, cargo × V(t)</th><th>Before the clamp</th></tr></thead><tbody>',
    table.incomeCap.map(incomeCapRowOf).join(''),
    '</tbody></table>',
    '</section>',
  ].join('')
}

export function renderRaritySharesFailure(message) {
  return `<section class="panel" id="rarity-shares-panel" data-error="1"><h2>Rarity shares</h2><div class="bad">The rarity share table failed to build: ${escapeHtml(message)}</div></section>`
}
