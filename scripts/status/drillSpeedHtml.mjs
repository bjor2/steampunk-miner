// Draws the status page's Drill speed panel (ticket 434) from the model of drillSpeed.mjs: per
// stored drill_power step, the ladder's cut m/s and the browser run's descent m/s in large type,
// each with its change since the run before and a sparkline over commits, the descent as a share
// of the cut against the 100% target, and the gain on the level before. A missing value reads
// "no run yet", never 0. Static HTML strings; classes come from scripts/status/index.html.
import { trendSvg } from './drillDownHtml.mjs'
import { escapeHtml } from './perfOverviewHtml.mjs'
import { ageOf } from './slotsHtml.mjs'

const NO_RUN = '<span class="ds-none">no run yet</span>'
const LADDER_SPEC = 'src/logging/drillLadderSteps.test.ts'
const BROWSER_SPEC = 'e2e/browser/drillDown.spec.ts'
const FULL_SHARE_PERCENT = 100

const speedText = (value) => value.toFixed(2)
const gainText = (value) => (value === null ? '—' : `×${value.toFixed(3)}`)
const runCountText = (count) => (count === 1 ? '1 run' : `${count} runs`)
const sharePercentOf = (share) => Math.round(share * FULL_SHARE_PERCENT)

function changeText(series) {
  if (series.change === null) return '<span class="muted">first run</span>'
  const sign = series.change > 0 ? '+' : ''
  return `<span class="muted" title="since the run before">${sign}${series.change.toFixed(2)}</span>`
}

function speedCell(series) {
  if (!series) return `<td>${NO_RUN}</td>`
  const commit = escapeHtml(series.latestPoint.commit ?? '—')
  const spark = trendSvg(series.trend, (value) => `${speedText(value)} m/s`)
  return `<td><b class="ds-big">${speedText(series.latest)}</b> m/s ${changeText(series)}<div class="ds-trend">${spark} <span class="muted">${runCountText(series.runCount)} · <span class="mono">${commit}</span></span></div></td>`
}

function shareCell(share) {
  if (share === null) return `<td>${NO_RUN}</td>`
  const percent = sharePercentOf(share)
  const width = Math.min(FULL_SHARE_PERCENT, percent)
  return `<td><b class="ds-big">${percent}%</b> <span class="muted">of the cut</span><div class="ds-bar" title="100% is the target: the body keeps up with the drill"><span style="width:${width}%"></span></div></td>`
}

function gainCell(step) {
  if (!step) return '<td class="muted">—</td>'
  return `<td><span class="muted">from ${step.from}:</span> cut <b>${gainText(step.cutGain)}</b> · law ${gainText(step.lawGain)} · descent <b>${gainText(step.descentGain)}</b></td>`
}

function levelRow(level, step) {
  return `<tr><td><b class="ds-big">${level.level}</b></td>${speedCell(level.cut)}${speedCell(level.descent)}${shareCell(level.descentShare)}${gainCell(step)}</tr>`
}

function levelTable(model) {
  const rows = model.levels.map((level, index) => levelRow(level, model.steps[index - 1])).join('')
  return `<table class="sl-table ds-table"><thead><tr><th>Level</th><th>Cut m/s (ladder)</th><th>Descent m/s (browser)</th><th>Descent ÷ cut (target 100%)</th><th>Gain on the level before</th></tr></thead><tbody>${rows}</tbody></table>`
}

function specLink(file, view) {
  return `<a class="mono" href="https://github.com/${escapeHtml(view.repo)}/blob/main/${file}">${file}</a>`
}

function noteOf(view) {
  return `<p class="muted ds-note">Level is the stored <span class="mono">drill_power</span> step the tests set (stored 10 equals major 1). <b>Cut</b>: the drill-speed ladder cuts the first 20 cells (band 1) of the P1 surface column, seed 83921, with the drill law alone, no vehicle travel (${specLink(LADDER_SPEC, view)}). <b>Descent</b>: the real Down key held 10 s on the same ground in the browser, metres toward the planet's centre per second (${specLink(BROWSER_SPEC, view)}). 1 cell = 1 m. Descent ÷ cut is the "remove ground, then fall" gap: 100% is the target. Gains are the latest runs' speeds divided level by level; law is the drill law's own gain for that step.</p>`
}

function sourcesOf(model, view) {
  return `<div class="muted">drill-ladder.ndjson (${model.ladderRunCount} ladder runs) and drill-down.ndjson (${model.drillDownRunCount} browser runs) on test-metrics, written by the box Tester · updated ${ageOf(model.updatedAt, view.nowMs)}</div>`
}

/** The panel; `view` carries `repo` (`owner/name`) and `nowMs`. */
export function renderDrillSpeed(model, view) {
  return `<section class="panel ds-panel" id="drill-speed-panel"><h2>Drill speed <small class="muted">what the drill cuts against how fast the body goes down</small></h2>
    ${levelTable(model)}${noteOf(view)}${sourcesOf(model, view)}</section>`
}
