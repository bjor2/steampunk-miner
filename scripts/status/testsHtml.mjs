// Renders the Tests tab of /status/ (#192) from the model of tests.mjs: the box Tester's state
// (running phase, gate and Claude slot, main-red pause, the no-run-in-6h warning), main's
// box-tester/* commit statuses, the latest run per phase and per nightly suite, the recent runs
// (box and the older Actions ones) and the failing, flaky and slowest test files. Static HTML
// strings; the page re-renders them on every live fetch. Classes come from scripts/status/index.html.
import { escapeHtml } from './perfOverviewHtml.mjs'
import { ageOf } from './slotsHtml.mjs'
import { TESTER_STALE_AFTER_H, TEST_PHASES, isGreenRun, shortSha } from './tests.mjs'

const MINUTE_S = 60
const PERCENT = 100

function durationText(sec) {
  if (sec === null) return '—'
  return sec < MINUTE_S ? `${sec}s` : `${Math.floor(sec / MINUTE_S)}m ${sec % MINUTE_S}s`
}

function commitLink(sha, view) {
  if (!sha) return '<span class="muted">—</span>'
  return `<a class="mono" href="https://github.com/${escapeHtml(view.repo)}/commit/${escapeHtml(sha)}">${shortSha(sha)}</a>`
}

function resultBadge(run) {
  if (!run) return '<span class="muted">no run</span>'
  const cls = isGreenRun(run) ? 'ok' : 'bad'
  const text = run.timedOut ? 'timed out' : (run.conclusion ?? 'unknown')
  const link = run.url
    ? `<a class="${cls}" href="${escapeHtml(run.url)}">${escapeHtml(text)}</a>`
    : `<span class="${cls}">${escapeHtml(text)}</span>`
  return link
}

function countsText(run) {
  if (!run.reportFound) return '<span class="muted">no Vitest report</span>'
  const failed = run.failed ? ` · <span class="bad">${run.failed} failed</span>` : ''
  return `${run.files} files · ${run.tests} tests${failed}`
}

function whenCell(stamp, view) {
  return `<td class="muted" title="${escapeHtml(stamp ?? '')}">${ageOf(stamp, view.nowMs)}</td>`
}

function mainRedBanner(model, view) {
  if (!model.mainRedSha) return ''
  return `<div class="bad te-banner"><b>MAIN RED</b>: the nightly full suite failed at ${commitLink(model.mainRedSha, view)}. The loop starts no new dev workers until a <code>tester.sh --full</code> run is green.</div>`
}

function staleBanner(model, view) {
  if (!model.freshness.isStale) return ''
  const seen = model.freshness.seenAt ? ageOf(model.freshness.seenAt, view.nowMs) : 'never'
  return `<div class="warn te-banner"><span class="badge stale">STALE</span> No box Tester run in ${TESTER_STALE_AFTER_H} h (last ${seen}). Tests no longer run in GitHub Actions, so nothing is testing main.</div>`
}

function testerNowLine(model, view) {
  const t = model.tester
  const last = `last box run <b title="${escapeHtml(model.freshness.seenAt ?? '')}">${ageOf(model.freshness.seenAt, view.nowMs)}</b>`
  if (!t) return `<div class="muted">Tester state not published yet · ${last}</div>`
  if (t.state !== 'running')
    return `<div>Tester <span class="badge sl-free">idle</span> · ${last}</div>`
  const gate = t.holdsGate ? ' · holds a gate token' : ' · waiting for / without a gate token'
  const claude = t.claudeSlot ? ` · triage in Claude slot C${t.claudeSlot}` : ''
  return `<div>Tester <span class="badge sl-busy">running ${escapeHtml(t.phase ?? '')}</span> on ${commitLink(t.sha, view)} since ${ageOf(t.since, view.nowMs)}${gate}${claude} · ${last}</div>`
}

function statusRow(s) {
  const cls = s.state === 'success' ? 'ok' : s.state === 'pending' ? 'warn' : 'bad'
  const state = s.url
    ? `<a class="${cls}" href="${escapeHtml(s.url)}">${escapeHtml(s.state)}</a>`
    : `<span class="${cls}">${escapeHtml(s.state)}</span>`
  return `<tr><td class="mono">${escapeHtml(s.context)}</td><td>${state}</td><td class="muted">${escapeHtml(s.description ?? '')}</td></tr>`
}

function statusesSection(model, view) {
  const rows =
    model.statuses.map(statusRow).join('') ||
    '<tr><td colspan="3" class="muted">No box-tester status on this commit yet (the Tester tests main after each push).</td></tr>'
  return `<section class="sl-pool"><h3>Commit status on main ${commitLink(model.statusSha, view)}</h3>
    <table class="sl-table"><thead><tr><th>Context</th><th>State</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

function phaseRow(phase, run, view) {
  if (!run) return `<tr><td>${phase}</td><td colspan="5" class="muted">no box run yet</td></tr>`
  return `<tr><td>${phase}</td><td>${resultBadge(run)}</td><td>${escapeHtml(run.mode ?? '')}</td><td>${commitLink(run.sha, view)}</td><td>${durationText(run.durationSec)} · ${countsText(run)}</td>${whenCell(run.startedAt, view)}</tr>`
}

function phasesSection(model, view) {
  const rows = TEST_PHASES.map((p) => phaseRow(p, model.latestByPhase[p], view)).join('')
  return `<section class="sl-pool"><h3>Latest box run per phase <span class="muted">fast = relevant tests after a push · slow = pacing bot + e2e · full / nightly = every night</span></h3>
    <table class="sl-table"><thead><tr><th>Phase</th><th>Result</th><th>Mode</th><th>Commit</th><th>Duration · tests</th><th>When</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

function suiteRow(run, view) {
  return `<tr><td>${escapeHtml(run.job ?? '')}</td><td>${resultBadge(run)}</td><td>${durationText(run.durationSec)}</td>${whenCell(run.startedAt, view)}</tr>`
}

function nightlySection(model, view) {
  const rows =
    model.nightlySuites.map((r) => suiteRow(r, view)).join('') ||
    '<tr><td colspan="4" class="muted">No box nightly yet (from the first loop pass after 01:30 Oslo).</td></tr>'
  return `<section class="sl-pool"><h3>Last nightly suites</h3>
    <table class="sl-table"><thead><tr><th>Suite</th><th>Result</th><th>Duration</th><th>When</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

function runRow(run, view) {
  const what =
    run.source === 'box'
      ? `${escapeHtml(run.phase ?? '')}${run.job && run.job !== run.phase ? ` · ${escapeHtml(run.job)}` : ''}`
      : escapeHtml(run.job ?? '')
  return `<tr><td><span class="badge${run.source === 'box' ? ' sl-busy' : ''}">${run.source}</span></td><td>${what}</td><td>${escapeHtml(run.mode ?? '')}</td><td>${commitLink(run.sha, view)}</td><td>${resultBadge(run)}</td><td>${durationText(run.durationSec)}</td><td>${countsText(run)}</td>${whenCell(run.startedAt, view)}<td class="muted">${escapeHtml(run.event ?? '')}</td></tr>`
}

function runsSection(model, view) {
  const rows = model.runs.map((r) => runRow(r, view)).join('')
  return `<section class="sl-pool te-wide"><h3>Recent runs <span class="muted">${model.runs.length} of ${model.runCount} in summary.json · ${model.boxRunCount} from the box</span></h3>
    <table class="sl-table"><thead><tr><th>Source</th><th>Phase · job</th><th>Mode</th><th>Commit</th><th>Result</th><th>Duration</th><th>Tests</th><th>When</th><th>Trigger</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

function fileRow(f) {
  const rate = f.passRate === null ? '—' : `${Math.round(f.passRate * PERCENT)}%`
  return `<tr><td class="mono">${escapeHtml(f.file)}</td><td>${escapeHtml(f.feature ?? '')}</td><td>${f.p95Ms === null ? '—' : `${(f.p95Ms / 1000).toFixed(1)}s`}</td><td>${rate}</td></tr>`
}

function filesTable(title, files, empty) {
  const rows = files.map(fileRow).join('') || `<tr><td colspan="4" class="muted">${empty}</td></tr>`
  return `<section class="sl-pool"><h3>${title}</h3><table class="sl-table"><thead><tr><th>File</th><th>Feature</th><th>p95</th><th>Pass rate</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

/** The Tests tab body. `view` carries `repo` (`owner/name`) and `nowMs`. */
export function renderTestsPanel(model, view) {
  return `${mainRedBanner(model, view)}${staleBanner(model, view)}${testerNowLine(model, view)}
    <div class="sl-grid">${statusesSection(model, view)}${phasesSection(model, view)}${nightlySection(model, view)}
    ${filesTable('Failing files', model.failingFiles, 'none failing in their last run')}
    ${filesTable('Flaky files', model.flakyFiles, 'none flagged flaky')}
    ${filesTable('Slowest files (p95)', model.slowestFiles, 'no timings yet')}</div>
    ${runsSection(model, view)}
    <div class="muted">Recorded on the <a href="https://github.com/${escapeHtml(view.repo)}/tree/test-metrics">test-metrics</a> branch (summary updated ${ageOf(model.updatedAt, view.nowMs)}) · <a href="https://github.com/${escapeHtml(view.repo)}/blob/main/docs/metrics/test-metrics.md">how it works</a></div>`
}

/** The tab body when summary.json is missing. */
export function renderTestsFailure(message) {
  return `<div class="warn">Test runs unavailable: ${escapeHtml(message)}</div>`
}
