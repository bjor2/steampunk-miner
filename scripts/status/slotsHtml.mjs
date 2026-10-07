// Renders the Slots tab of /status/ (#193) and its one-line overview in the page header from the
// model of slots.mjs: the Grok agent pool, then the Claude Code pool per account, each slot with
// its state, ticket link, linked slot in the other pool and since-time. A Grok slot and the Claude
// slot it runs share a hue (`--pair-hue`, from the Grok slot number). Static HTML strings; the
// page re-renders them on every live fetch. The classes come from scripts/status/index.html.
import { escapeHtml } from './perfOverviewHtml.mjs'
import { SLOTS_STALE_AFTER_MIN, claudeUsageByAccount } from './slots.mjs'

const SECOND_MS = 1000
const MINUTE_S = 60
const HOUR_S = 3600
const DAY_S = 86_400
// Golden-angle steps keep neighbouring Grok slots' colours apart.
const PAIR_HUE_STEP = 137
const FULL_TURN = 360

/** `5m ago`-style age of an ISO stamp at `nowMs`; a dash when there is none. */
export function ageOf(stamp, nowMs) {
  if (!stamp) return '—'
  const s = Math.max(0, Math.round((nowMs - Date.parse(stamp)) / SECOND_MS))
  if (s < MINUTE_S) return `${s}s ago`
  if (s < HOUR_S) return `${Math.round(s / MINUTE_S)}m ago`
  if (s < DAY_S) return `${(s / HOUR_S).toFixed(1)}h ago`
  return `${Math.round(s / DAY_S)}d ago`
}

function pairStyle(grokSlot) {
  return `--pair-hue:${(grokSlot * PAIR_HUE_STEP) % FULL_TURN}`
}

function pairChip(text, grokSlot) {
  return `<span class="sl-pair" style="${pairStyle(grokSlot)}">${escapeHtml(text)}</span>`
}

function ticketLink(ticket, view) {
  if (!ticket) return '<span class="muted">—</span>'
  const title = view.titles?.[ticket]
  const url = `https://github.com/${view.repo}/issues/${ticket}`
  const titleHtml = title ? ` <span class="muted">${escapeHtml(title)}</span>` : ''
  return `<a href="${escapeHtml(url)}">#${ticket}</a>${titleHtml}`
}

function sinceCell(since, view) {
  return `<td class="muted" title="${escapeHtml(since ?? '')}">${ageOf(since, view.nowMs)}</td>`
}

function stateBadge(state, kind, label = null) {
  const kindText = [kind && kind !== 'dev' ? kind : null, label].filter(Boolean).join(' · ')
  const kindHtml = kindText ? ` <span class="muted">${escapeHtml(kindText)}</span>` : ''
  return `<span class="badge sl-${escapeHtml(state)}">${escapeHtml(state)}</span>${kindHtml}`
}

function grokLinkCell(g) {
  if (!g.claude) return '<span class="muted">—</span>'
  const where = g.claude.account ? ` (${g.claude.account})` : ''
  return pairChip(`G${g.slot} ↔ ${g.claude.slot}${where}`, g.slot)
}

function grokRow(g, view) {
  return `<tr>
    <td>${g.claude ? pairChip(`G${g.slot}`, g.slot) : `G${g.slot}`}</td>
    <td>${stateBadge(g.state, null)}</td>
    <td>${ticketLink(g.ticket, view)}</td>
    <td>${grokLinkCell(g)}</td>
    ${sinceCell(g.since, view)}</tr>`
}

function claudeLinkCell(s) {
  if (s.grokSlot === null) return '<span class="muted">—</span>'
  const warning = s.isGrokSlotFree
    ? ' <span class="badge stale" title="its Grok slot is free">G free</span>'
    : ''
  return `${pairChip(`${s.slot} ↔ G${s.grokSlot}`, s.grokSlot)}${warning}`
}

function claudeRow(s, view) {
  const slotHtml = s.grokSlot === null ? s.slot : pairChip(s.slot, s.grokSlot)
  return `<tr>
    <td>${slotHtml}</td>
    <td>${stateBadge(s.state, s.kind, s.label)}</td>
    <td>${ticketLink(s.ticket, view)}</td>
    <td>${claudeLinkCell(s)}</td>
    ${sinceCell(s.since, view)}</tr>`
}

function slotTable(firstColumn, linkColumn, rowsHtml) {
  return `<table class="sl-table"><thead><tr><th>${firstColumn}</th><th>State</th><th>Ticket</th><th>${linkColumn}</th><th>Since</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="5" class="muted">No slots in this pool.</td></tr>'}</tbody></table>`
}

function grokCapsText(totals) {
  const cap = (n) => (n === null ? '' : `/${n}`)
  return `dev ${totals.dev}${cap(totals.devCap)}, planner ${totals.planner}${cap(totals.plannerCap)}`
}

function grokSection(model, view) {
  const t = model.totals.grok
  return `<section class="sl-pool">
    <h3>Grok agent slots <span class="muted">${t.used}/${t.size} busy · ${grokCapsText(t)}</span></h3>
    ${slotTable('Grok slot', 'Claude slot', model.grok.map((g) => grokRow(g, view)).join(''))}</section>`
}

function accountHeading(account) {
  const id = account.id ? `${escapeHtml(account.id)} · ` : ''
  const usage = account.isEnabled
    ? `<span class="muted">${account.used}/${account.size} busy</span>`
    : `<span class="badge sl-disabled">disabled</span> <span class="muted">${escapeHtml(account.reason ?? '')}</span>`
  return `<h4>${id}${escapeHtml(account.name)} ${usage}</h4>`
}

function accountBlock(account, view) {
  const rows = account.slots.map((s) => claudeRow(s, view)).join('')
  return `<div class="sl-account${account.isEnabled ? '' : ' sl-off'}">${accountHeading(account)}${slotTable('Claude slot', 'Grok slot', rows)}</div>`
}

function claudeSection(model, view) {
  const t = model.totals.claude
  const accountsHtml = model.accounts.map((a) => accountBlock(a, view)).join('')
  return `<section class="sl-pool">
    <h3>Claude Code slots <span class="muted">${t.used}/${t.size} busy · ${escapeHtml(claudeUsageByAccount(model))}</span></h3>
    ${accountsHtml}</section>`
}

function freshnessLine(freshness, view) {
  const seen = freshness.seenAt ? ageOf(freshness.seenAt, view.nowMs) : 'never'
  if (!freshness.isStale) return `<div class="muted sl-fresh">Snapshot confirmed ${seen}.</div>`
  return `<div class="warn sl-fresh"><span class="badge stale">STALE</span> The loop last confirmed this snapshot ${seen} (over ${SLOTS_STALE_AFTER_MIN} min): slots may have changed since.</div>`
}

function testerText(tester, view) {
  if (!tester) return 'Tester: <span class="muted">not published</span>'
  const queued = tester.queued
    ? ` · ${tester.queued} spec(s) awaiting test (<a href="#tests">Tests tab</a>)`
    : ''
  if (tester.state !== 'running') {
    return `Tester: <span class="badge sl-free">idle</span> <span class="muted">last run ${ageOf(tester.lastRunAt, view.nowMs)}</span>${queued}`
  }
  const feature = tester.feature
    ? ` spec <a href="https://github.com/${escapeHtml(view.repo)}/issues/${tester.feature}">#${tester.feature}</a>`
    : ''
  const holds = [
    tester.holdsGate ? 'a gate token' : null,
    tester.claudeSlot ? `Claude slot C${tester.claudeSlot}` : null,
  ]
    .filter(Boolean)
    .join(' + ')
  return `Tester: <span class="badge sl-busy">${escapeHtml(tester.phase ?? 'running')}</span>${feature} holds ${holds || 'nothing yet (waiting for a gate token)'} <span class="muted">since ${ageOf(tester.since, view.nowMs)}</span>${queued}`
}

// Gate tokens (worker gates + Tester heavy phases) and the box Tester, under the freshness line.
function stageLine(model, view) {
  const gate = model.gate ? `Gate tokens <b>${model.gate.busy}/${model.gate.max}</b> busy` : ''
  const red = model.tester?.mainRedSha
    ? ' · <span class="badge stale">MAIN RED</span> no new dev workers (<a href="#tests">Tests tab</a>)'
    : ''
  return `<div class="sl-fresh">${[gate, testerText(model.tester, view)].filter(Boolean).join(' · ')}${red}</div>`
}

/**
 * The Slots tab body. `view` carries what the model does not: `repo` (`owner/name`), `nowMs`,
 * the `freshness` from slotsFreshness and optional issue `titles` by number.
 */
export function renderSlotsPanel(model, view) {
  return `${freshnessLine(view.freshness, view)}${stageLine(model, view)}<div class="sl-grid">${grokSection(model, view)}${claudeSection(model, view)}</div>`
}

/** The tab body when slots.json is missing or malformed. */
export function renderSlotsFailure(message) {
  return `<div class="warn">Slot snapshot unavailable: ${escapeHtml(message)}</div>`
}

/** The header line on every tab: both pools, Claude per account, stale when old. */
export function renderSlotsOverview(model, freshness) {
  const stale = freshness.isStale ? ' <span class="badge stale">STALE</span>' : ''
  const t = model.totals.grok
  return `slots: Grok <b>${t.used}/${t.size}</b> (${grokCapsText(t)}) · Claude <b>${model.totals.claude.used}/${model.totals.claude.size}</b> (${escapeHtml(claudeUsageByAccount(model))})${stale} · <a href="#slots">Slots tab</a>`
}
