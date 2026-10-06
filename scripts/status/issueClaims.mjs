// Who works on which issue, from the loop's own files (#194): loops.json (live slot entries, the
// coordinator's attempts, push_pending and planner slots, the event log) and the published
// slots.json (Grok and Claude slots, account, claim time). Pure and import-free: the page loads
// this file as is, next to issueBuckets.mjs.
//
// Only live loops.json entries make an issue ongoing; slots.json is the Pages build's snapshot, so
// it only adds detail to a claim loops.json already has.

/** The coordinator facts of loops.json: attempts per ticket, the attempt cap and push_pending. */
export function loopFactsOf(loops) {
  const facts = { attempts: {}, maxAttempts: Infinity, pushPending: null, planner: [] }
  for (const entry of entriesOf(loops)) addCoordinatorFacts(facts, entry.extra)
  return facts
}

function entriesOf(loops) {
  return Object.values(loops?.entries ?? {})
}

function addCoordinatorFacts(facts, extra) {
  if (!extra) return
  if (extra.attempts) Object.assign(facts.attempts, extra.attempts)
  if (Number.isFinite(extra.max_attempts)) facts.maxAttempts = extra.max_attempts
  if (extra.push_pending) facts.pushPending = extra.push_pending
  if (Array.isArray(extra.planner)) facts.planner.push(...extra.planner)
}

function isWorkingOnIssue(entry) {
  return entry.state === 'working' && Number.isInteger(entry.issue)
}

/**
 * `Map<issue number, claim>` of every live loop worker and planner slot. A claim:
 * `{ loop, slot, kind, grokSlot, claudeSlot, account, model, effort, claimedAt }`, unknown parts null.
 */
export function loopClaimsOf(loops, slots) {
  const claims = workerClaimsOf(loops)
  addPlannerClaims(claims, loopFactsOf(loops).planner)
  addSlotDetails(claims, slots)
  addClaimStarts(claims, claimStartsOf(loops?.events ?? []))
  return claims
}

function workerClaimsOf(loops) {
  const workers = entriesOf(loops).filter(isWorkingOnIssue)
  return new Map(workers.map((entry) => [entry.issue, workerClaimOf(entry)]))
}

function emptyClaim() {
  return {
    loop: null,
    slot: null,
    kind: null,
    grokSlot: null,
    claudeSlot: null,
    account: null,
    model: null,
    effort: null,
    claimedAt: null,
  }
}

// A loop may already publish its session's account, model and effort on the entry.
function workerClaimOf(entry) {
  const extra = entry.extra ?? {}
  return {
    ...emptyClaim(),
    loop: entry.loop,
    slot: entry.slot ?? null,
    kind: 'dev',
    account: extra.account ?? null,
    model: extra.model ?? null,
    effort: extra.effort ?? null,
    claimedAt: extra.claimed_at ?? null,
  }
}

function addPlannerClaims(claims, planners) {
  for (const planner of planners) {
    if (Number.isInteger(planner.ticket) && !claims.has(planner.ticket)) {
      claims.set(planner.ticket, plannerClaimOf(planner))
    }
  }
}

function plannerClaimOf(planner) {
  return { ...emptyClaim(), loop: 'planner', kind: 'planner', grokSlot: planner.grok_slot ?? null }
}

function byTime(a, b) {
  return Date.parse(a.at) - Date.parse(b.at)
}

/**
 * `Map<issue number, iso>`: when each slot's current run of `working` on an issue began, from the
 * loops.json event log (newest first, as published; heartbeats add no event).
 */
export function claimStartsOf(events) {
  const starts = new Map()
  const issueOfKey = new Map()
  for (const event of [...events].sort(byTime)) {
    const issue = event.state === 'working' ? event.issue : null
    if (issue && issueOfKey.get(event.key) !== issue) starts.set(issue, event.at)
    issueOfKey.set(event.key, issue)
  }
  return starts
}

function addClaimStarts(claims, starts) {
  for (const [issue, claim] of claims) claim.claimedAt ??= starts.get(issue) ?? null
}

// The snapshot can be older than the live entries: a seat only adds to a claim in the same slot,
// so a retry in another slot never shows the first attempt's slot or claim time.
function addSlotDetails(claims, slots) {
  for (const seat of claudeSeatsOf(slots)) addClaudeSeat(claims.get(seat.ticket), seat)
  for (const seat of slots?.grok ?? []) addGrokSeat(claims.get(seat.ticket), seat)
}

function isClaudeSeatOf(claim, seat) {
  return claim.kind === 'dev' && (claim.slot === null || `C${claim.slot}` === seat.slot)
}

function isGrokSeatOf(claim, seat) {
  return claim.grokSlot === null || String(claim.grokSlot) === String(seat.slot)
}

// slots.json v2 lists the Claude slots per account; v1 (no `accounts`) in one `claude` pool.
function claudeSeatsOf(slots) {
  if (Array.isArray(slots?.accounts)) return slots.accounts.flatMap(accountSeatsOf)
  return (slots?.claude ?? []).map((seat) => ({ ...seat, slot: `C${seat.slot}` }))
}

function accountSeatsOf(account) {
  const name = account.name ?? account.label ?? account.id ?? null
  return (account.slots ?? []).map((seat) => ({ ...seat, accountName: name }))
}

// The loop publishes the claim time with an offset (+02:00); the page shows it in Oslo time.
function addClaudeSeat(claim, seat) {
  if (!claim || !isClaudeSeatOf(claim, seat)) return
  claim.claudeSlot ??= seat.slot
  claim.grokSlot ??= seat.grok_slot ?? null
  claim.account ??= seat.accountName ?? null
  claim.model ??= seat.model ?? null
  claim.effort ??= seat.effort ?? null
  claim.claimedAt ??= seat.since ?? null
}

function addGrokSeat(claim, seat) {
  if (!claim || !isGrokSeatOf(claim, seat)) return
  claim.grokSlot ??= seat.slot
  claim.claimedAt ??= seat.since ?? null
}

/**
 * When the work on an ongoing issue began: the loop's claim time when it has one, else the time
 * the `in-progress` label was applied (build-status.mjs reads it from the issue timeline).
 */
export function startedAtOf(issue, claim) {
  return claim?.claimedAt ?? issue.inProgressAt ?? null
}

/** The time `name` was last applied, from the issue timeline's LabeledEvent nodes, or null. */
export function labelAppliedAt(timelineNodes, name) {
  const times = (timelineNodes ?? [])
    .filter((node) => node?.label?.name === name)
    .map((node) => node.createdAt)
    .sort()
  return times.at(-1) ?? null
}

// The build loop's session tiers (loop README "Model/effort tiers", the tier:* label
// descriptions): design always runs fable, a tier:easy retry escalates to hard.
const BUILD_LOOP = 'steampunk-loop'
const SESSION_TIERS = {
  fable: { model: 'fable', effort: 'high' },
  hard: { model: 'opus', effort: 'high' },
  easy: { model: 'opus', effort: 'medium' },
}

function labelNamesOf(issue) {
  return issue.labels.map((label) => label.name)
}

function sessionTierNameOf(issue, attempt) {
  const names = labelNamesOf(issue)
  if (names.includes('design') || names.includes('tier:fable')) return 'fable'
  if (names.includes('tier:easy') && attempt < 2) return 'easy'
  return 'hard'
}

function hasPublishedSession(claim) {
  return Boolean(claim.model || claim.effort)
}

function tierSessionOf(issue, loopFacts) {
  return SESSION_TIERS[sessionTierNameOf(issue, loopFacts.attempts[issue.number] ?? 1)]
}

/**
 * The model and effort of a loop worker's session: what the loop published, else, for the build
 * loop, what its tier rule gives for the issue's labels and attempt. Null for a planner slot (no
 * Claude session) and for another loop that published none.
 */
export function sessionOf(issue, claim, loopFacts) {
  if (claim?.kind !== 'dev') return null
  if (claim.loop !== BUILD_LOOP && !hasPublishedSession(claim)) return null
  const tier = tierSessionOf(issue, loopFacts)
  return { model: claim.model ?? tier.model, effort: claim.effort ?? tier.effort }
}
