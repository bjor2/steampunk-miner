// The filtered issue list of /status/#issues (#194): the status filter buttons and one compact,
// expandable card per issue with the metadata the page already has. Pure: `now` is passed in and
// times are formatted in Oslo time whatever the reader's zone. The page loads this file as is
// (build-status.mjs copies it next to index.html); its classes live in index.html. A field with no
// data is left out, never shown as an error.
import { BUCKETS, bucketOf, isOpen, isTypeLabel, issueTypeOf } from './issueBuckets.mjs'
import { sessionOf, startedAtOf } from './issueClaims.mjs'

const MINUTE_MS = 60000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const OSLO = 'Europe/Oslo'
const OSLO_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: OSLO,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const OSLO_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: OSLO,
  day: 'numeric',
  month: 'short',
})
const CLOSE_REASONS = { COMPLETED: 'completed', NOT_PLANNED: 'not planned', DUPLICATE: 'duplicate' }
const DARK_LABEL_LUMINANCE = 0.35

export function escapeHtml(text) {
  return String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

/** "21:12" on the same Oslo day as `nowMs`, else "5 Oct 21:12". */
export function osloTimeOf(iso, nowMs) {
  const at = new Date(iso)
  const clock = OSLO_CLOCK.format(at)
  const day = OSLO_DAY.format(at)
  return day === OSLO_DAY.format(new Date(nowMs)) ? clock : `${day} ${clock}`
}

function wholeUnits(ms, unitMs) {
  return Math.floor(ms / unitMs)
}

function twoUnitText(big, bigName, small, smallName) {
  return small ? `${big} ${bigName} ${small} ${smallName}` : `${big} ${bigName}`
}

/** "34 min ago", "2 h 5 min ago", "3 d 4 h ago"; "just now" under a minute. */
export function elapsedText(iso, nowMs) {
  const ms = Math.max(0, nowMs - Date.parse(iso))
  if (ms < MINUTE_MS) return 'just now'
  if (ms < HOUR_MS) return `${wholeUnits(ms, MINUTE_MS)} min ago`
  if (ms < DAY_MS) {
    return `${twoUnitText(wholeUnits(ms, HOUR_MS), 'h', wholeUnits(ms % HOUR_MS, MINUTE_MS), 'min')} ago`
  }
  return `${twoUnitText(wholeUnits(ms, DAY_MS), 'd', wholeUnits(ms % DAY_MS, HOUR_MS), 'h')} ago`
}

/** "21:12, 34 min ago". */
export function whenText(iso, nowMs) {
  return `${osloTimeOf(iso, nowMs)}, ${elapsedText(iso, nowMs)}`
}

function timeHtml(iso, text) {
  return `<time datetime="${escapeHtml(iso)}" title="${escapeHtml(iso)}">${escapeHtml(text)}</time>`
}

function luminanceOf(hex) {
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16))
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** A label chip in the label's GitHub colour; dark colours get light text. */
export function labelChipHtml(label) {
  const hex = label.color || '777777'
  const text = luminanceOf(hex) < DARK_LABEL_LUMINANCE ? '#ddd' : `#${hex}`
  return `<span class="lbl" style="background:#${hex}33;color:${text};border:1px solid #${hex}88">${escapeHtml(label.name)}</span>`
}

/** One button per bucket with its count; the active one is pressed. */
export function bucketButtonsHtml(counts, activeId) {
  return BUCKETS.map(
    (bucket) =>
      `<button type="button" class="bucket" data-bucket="${bucket.id}" aria-pressed="${bucket.id === activeId}">` +
      `${escapeHtml(bucket.name)} <b>${counts[bucket.id] ?? 0}</b></button>`,
  ).join('')
}

function issueUrlOf(number, page) {
  return page.byNum.get(number)?.url ?? `https://github.com/${page.repo}/issues/${number}`
}

function issueLinkHtml(number, page) {
  const title = page.byNum.get(number)?.title ?? ''
  return `<a href="${escapeHtml(issueUrlOf(number, page))}" title="${escapeHtml(title)}">#${number}</a>`
}

function stateIconHtml(issue) {
  if (isOpen(issue)) return '<span class="ico open" title="open">◉</span>'
  if (issue.stateReason === 'NOT_PLANNED') {
    return '<span class="ico notplanned" title="closed: not planned">⊘</span>'
  }
  return '<span class="ico closed" title="closed">✔</span>'
}

function typeChipHtml(issue) {
  const type = issueTypeOf(issue)
  return type ? `<span class="itype t-${type}">${type}</span>` : ''
}

function labelChipsHtml(issue) {
  return issue.labels
    .filter((label) => !isTypeLabel(label))
    .map(labelChipHtml)
    .join(' ')
}

function headTimeHtml(issue, page) {
  const bucket = bucketOf(issue, page)
  if (bucket === 'closed' && issue.closedAt) {
    return `<span class="muted">closed ${timeHtml(issue.closedAt, whenText(issue.closedAt, page.nowMs))}</span>`
  }
  const started = bucket === 'ongoing' ? startedAtOf(issue, page.claims.get(issue.number)) : null
  return started
    ? `<span class="started">started ${timeHtml(started, whenText(started, page.nowMs))}</span>`
    : ''
}

function cardHeadHtml(issue, page) {
  return (
    `<summary class="iss-head">${stateIconHtml(issue)}<span class="num">#${issue.number}</span>` +
    `<a class="title${isOpen(issue) ? '' : ' closed'}" href="${escapeHtml(issue.url)}" target="_blank" rel="noopener">${escapeHtml(issue.title)}</a>` +
    `${typeChipHtml(issue)} ${labelChipsHtml(issue)} ${headTimeHtml(issue, page)}</summary>`
  )
}

function metaRowHtml(name, valueHtml) {
  return valueHtml ? `<dt>${name}</dt><dd>${valueHtml}</dd>` : ''
}

function parentHtml(issue, page) {
  if (issue.parent === null || issue.parent === undefined) return ''
  const parent = page.byNum.get(issue.parent)
  const type = parent ? typeChipHtml(parent) : ''
  return `${issueLinkHtml(issue.parent, page)} ${escapeHtml(parent?.title ?? '')} ${type}`
}

function blockerHtml(blocker, page) {
  const state = blocker.state === 'OPEN' ? ' <span class="blk">open</span>' : ''
  return `${issueLinkHtml(blocker.number, page)}${state}`
}

function blockedByHtml(issue, page) {
  return issue.blockedBy.map((blocker) => blockerHtml(blocker, page)).join(', ')
}

function blockingHtml(issue, page) {
  return issue.blocking.map((number) => issueLinkHtml(number, page)).join(', ')
}

function datedHtml(iso, page) {
  return iso ? timeHtml(iso, whenText(iso, page.nowMs)) : ''
}

function closedHtml(issue, page) {
  if (!issue.closedAt) return ''
  const reason = CLOSE_REASONS[issue.stateReason]
  return datedHtml(issue.closedAt, page) + (reason ? ` · ${reason}` : '')
}

function slotText(claim) {
  const seats = [claim.grokSlot && `G${claim.grokSlot}`, claim.claudeSlot].filter(Boolean)
  if (seats.length) return seats.join(' · ')
  return claim.slot ? `${claim.loop} / slot ${claim.slot}` : claim.loop
}

function attemptText(issue, loopFacts) {
  const attempts = loopFacts.attempts[issue.number]
  if (!attempts) return ''
  const cap = Number.isFinite(loopFacts.maxAttempts) ? `/${loopFacts.maxAttempts}` : ''
  return `attempt ${attempts}${cap}`
}

function claimParts(issue, page) {
  const claim = page.claims.get(issue.number)
  if (!claim) return []
  const session = sessionOf(issue, claim, page.loopFacts)
  const kind = claim.kind === 'planner' ? 'planner' : ''
  return [slotText(claim), kind, claim.account, session && `${session.model} · ${session.effort}`]
}

function isPushPending(issue, loopFacts) {
  return loopFacts.pushPending?.ticket === issue.number
}

function loopHtml(issue, page) {
  const parts = [...claimParts(issue, page), attemptText(issue, page.loopFacts)].filter(Boolean)
  const pending = isPushPending(issue, page.loopFacts)
    ? ' <span class="bad">push_pending</span>'
    : ''
  return parts.map(escapeHtml).join(' · ') + pending
}

function phaseHtml(issue, page) {
  const phase = page.phases?.[issue.number]
  if (!phase) return ''
  return `<span class="iss-phase">${phase.barHtml}</span> ${escapeHtml(phase.totalText)}`
}

function cardBodyHtml(issue, page) {
  return (
    '<dl class="iss-meta">' +
    metaRowHtml('Parent', parentHtml(issue, page)) +
    metaRowHtml('Blocked by', blockedByHtml(issue, page)) +
    metaRowHtml('Blocking', blockingHtml(issue, page)) +
    metaRowHtml('Created', datedHtml(issue.createdAt, page)) +
    metaRowHtml('Updated', datedHtml(issue.updatedAt, page)) +
    metaRowHtml('Closed', closedHtml(issue, page)) +
    metaRowHtml('Loop', loopHtml(issue, page)) +
    metaRowHtml('Time', phaseHtml(issue, page)) +
    '</dl>'
  )
}

/** What the search box matches on: number, title, labels, type and the loop slot. */
export function issueSearchText(issue, claim) {
  const parts = [issue.number, `#${issue.number}`, issue.title, issueTypeOf(issue) ?? '']
  const labels = issue.labels.map((label) => label.name)
  const seats = claim ? [claim.loop, slotText(claim)] : []
  return [...parts, ...labels, ...seats].join(' ').toLowerCase()
}

/**
 * One card: the head line always shows, the metadata on expanding. `page`: `{ repo, byNum, claims,
 * loopFacts, phases, nowMs, expanded: Set<number> }`.
 */
export function issueCardHtml(issue, page) {
  const open = page.expanded?.has(issue.number) ? ' open' : ''
  const search = issueSearchText(issue, page.claims.get(issue.number))
  return (
    `<details class="iss" data-n="${issue.number}" data-search="${escapeHtml(search)}"${open}>` +
    cardHeadHtml(issue, page) +
    cardBodyHtml(issue, page) +
    '</details>'
  )
}

export function issueListHtml(issues, page) {
  if (!issues.length) return '<p class="muted iss-empty">No issues in this filter.</p>'
  return issues.map((issue) => issueCardHtml(issue, page)).join('')
}
