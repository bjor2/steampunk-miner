// The model behind the Slots tab of /status/ (#193): the build loop's two slot pools from the
// `slots.json` the loop driver publishes on the orphan `loop-status` branch (docs/loop-status.md).
// Grok agent slots are free or run a dev or planner agent; Claude Code slots are free, busy or
// disabled, grouped per Claude account when the snapshot has `accounts` (else one pool). A Grok
// agent running a Claude session holds one slot in each pool; both sides carry the link.
// Only the documented fields are copied, so pids, paths, rooms or emails in a box copy never
// reach the page. Pure and DOM-free: the page imports it as an ES module, build-status.mjs and
// the tests import it from node; the clock is passed in.

/** The loops.json loop whose heartbeats say the published snapshot is still current. */
export const SLOTS_LOOP = 'steampunk-loop'
// The loop publishes only on change, so freshness is the newer of the snapshot and the loop's
// heartbeat; heartbeats come every 10 min while a session runs, the raw CDN lags up to 5 min.
export const SLOTS_STALE_AFTER_MIN = 20
const MINUTE_MS = 60_000
const GROK_STATES = ['free', 'dev', 'planner']
const CLAUDE_STATES = ['free', 'busy', 'disabled']
const CLAUDE_KINDS = ['dev', 'aux', 'external']
const CLAUDE_SLOT_PREFIX = 'C'
// A path, an email or a host name never goes on the public page, even in a free-text field.
const PRIVATE_TEXT = /[/\\@~]|\.[a-z]{2,}\b/i

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveIntegerOrNull(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function stampOrNull(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
}

function knownOr(value, known, fallback) {
  return known.includes(value) ? value : fallback
}

function publicTextOrNull(value) {
  return typeof value === 'string' && value !== '' && !PRIVATE_TEXT.test(value) ? value : null
}

function claudeSlotNumberOf(slot) {
  if (Number.isSafeInteger(slot)) return slot
  const digits = String(slot ?? '').slice(CLAUDE_SLOT_PREFIX.length)
  return positiveIntegerOrNull(Number.parseInt(digits, 10))
}

function readGrokSlot(entry) {
  return {
    slot: positiveIntegerOrNull(entry?.slot),
    state: knownOr(entry?.state, GROK_STATES, 'free'),
    ticket: positiveIntegerOrNull(entry?.ticket),
    since: stampOrNull(entry?.since),
    claudeSlot: positiveIntegerOrNull(entry?.claude_slot),
  }
}

function readClaudeSlot(entry) {
  const number = claudeSlotNumberOf(entry?.slot)
  return {
    number,
    slot: `${CLAUDE_SLOT_PREFIX}${number ?? '?'}`,
    state: knownOr(entry?.state, CLAUDE_STATES, 'free'),
    kind: knownOr(entry?.kind, CLAUDE_KINDS, null),
    // An aux session's purpose (e.g. tester-triage: the box Tester's Claude triage).
    label: publicTextOrNull(entry?.label),
    ticket: positiveIntegerOrNull(entry?.ticket),
    grokSlot: positiveIntegerOrNull(entry?.grok_slot),
    since: stampOrNull(entry?.since),
  }
}

function accountNameOf(account) {
  const number = positiveIntegerOrNull(account.account)
  return publicTextOrNull(account.name) ?? (number ? `Claude Max ${number}` : 'Claude')
}

function readAccount(account) {
  return {
    id: publicTextOrNull(account?.id),
    name: accountNameOf(account ?? {}),
    isEnabled: account?.enabled !== false,
    reason: publicTextOrNull(account?.reason),
    slots: (Array.isArray(account?.slots) ? account.slots : []).map(readClaudeSlot),
  }
}

// A v1 snapshot (or one without `accounts`) is one Claude pool.
function singlePoolOf(claude) {
  return [
    { id: null, name: 'Claude', isEnabled: true, reason: null, slots: claude.map(readClaudeSlot) },
  ]
}

function malformedReason(raw) {
  if (!isObject(raw)) return 'not a JSON object'
  if (!Array.isArray(raw.grok)) return '`grok` is not a list'
  if (!Array.isArray(raw.claude)) return '`claude` is not a list'
  if (raw.accounts !== undefined && !Array.isArray(raw.accounts)) return '`accounts` is not a list'
  return null
}

function linkGrokToClaude(grok, accounts) {
  const owners = new Map()
  for (const account of accounts) for (const s of account.slots) owners.set(s.number, account.id)
  return grok.map((g) => ({
    ...g,
    claude: g.claudeSlot
      ? { slot: `${CLAUDE_SLOT_PREFIX}${g.claudeSlot}`, account: owners.get(g.claudeSlot) ?? null }
      : null,
  }))
}

// A busy Claude slot pointing at a free (or missing) Grok slot is a loop bookkeeping fault.
function linkClaudeToGrok(accounts, grok) {
  const grokStates = new Map(grok.map((g) => [g.slot, g.state]))
  const isOrphan = (s) => s.grokSlot !== null && (grokStates.get(s.grokSlot) ?? 'free') === 'free'
  return accounts.map((account) => ({
    ...account,
    slots: account.slots.map((s) => ({ ...s, isGrokSlotFree: isOrphan(s) })),
  }))
}

function countOf(items, predicate) {
  return items.filter(predicate).length
}

function capOrNull(caps, name) {
  return positiveIntegerOrNull(isObject(caps) ? caps[name] : undefined)
}

function grokTotalsOf(grok, caps) {
  return {
    size: grok.length,
    used: countOf(grok, (g) => g.state !== 'free'),
    dev: countOf(grok, (g) => g.state === 'dev'),
    devCap: capOrNull(caps, 'dev'),
    planner: countOf(grok, (g) => g.state === 'planner'),
    plannerCap: capOrNull(caps, 'planner'),
  }
}

function claudeTotalsOf(slots) {
  return {
    size: slots.length,
    enabled: countOf(slots, (s) => s.state !== 'disabled'),
    used: countOf(slots, (s) => s.state === 'busy'),
  }
}

function withAccountTotals(account) {
  return { ...account, ...claudeTotalsOf(account.slots) }
}

function poolsOf(raw) {
  const grok = raw.grok.map(readGrokSlot)
  const hasAccounts = Array.isArray(raw.accounts) && raw.accounts.length > 0
  const accounts = hasAccounts ? raw.accounts.map(readAccount) : singlePoolOf(raw.claude)
  return { grok, accounts, isSplitByAccount: hasAccounts }
}

function countOrNull(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

// The gate stage semaphore: worker gate runs and the box Tester's heavy phases share its tokens.
function readGate(raw) {
  const gate = isObject(raw.gate) ? raw.gate : {}
  const max = positiveIntegerOrNull(gate.max) ?? capOrNull(raw.caps, 'gate')
  return max === null ? null : { busy: countOrNull(gate.busy) ?? 0, max }
}

const TESTER_STATES = ['idle', 'running']

// The box Tester (tester.sh): which phase runs, whether it holds a gate token or a Claude slot.
function readTester(raw) {
  const t = raw.tester
  if (!isObject(t)) return null
  return {
    state: knownOr(t.state, TESTER_STATES, 'idle'),
    phase: publicTextOrNull(t.phase),
    since: stampOrNull(t.since),
    holdsGate: t.holds_gate === true,
    claudeSlot: positiveIntegerOrNull(t.claude_slot),
    lastRunAt: stampOrNull(t.last_run),
    mainRedSha: publicTextOrNull(t.main_red_sha),
    feature: positiveIntegerOrNull(t.feature),
    queued: Array.isArray(t.queue) ? t.queue.length : 0,
  }
}

function modelOf(raw, pools) {
  const accounts = linkClaudeToGrok(pools.accounts, pools.grok).map(withAccountTotals)
  return {
    updatedAt: stampOrNull(raw.updated_at),
    grok: linkGrokToClaude(pools.grok, accounts),
    accounts,
    isSplitByAccount: pools.isSplitByAccount,
    gate: readGate(raw),
    tester: readTester(raw),
    totals: {
      grok: grokTotalsOf(pools.grok, raw.caps),
      claude: claudeTotalsOf(accounts.flatMap((a) => a.slots)),
    },
  }
}

/** The page model of a parsed `slots.json`, or `{ error }` when its shape is not the contract. */
export function readSlotsSnapshot(raw) {
  const reason = malformedReason(raw)
  if (reason) return { error: `slots.json is malformed: ${reason}` }
  return modelOf(raw, poolsOf(raw))
}

/** Every heartbeat (`updated_at`) of `loop` and its slot entries in a loops.json document. */
export function heartbeatsOfLoop(loopsDoc, loop = SLOTS_LOOP) {
  const entries = Object.values(isObject(loopsDoc?.entries) ? loopsDoc.entries : {})
  return entries.filter((e) => e?.loop === loop).map((e) => e.updated_at)
}

function newestStampOf(stamps) {
  const times = stamps.map(stampOrNull).filter(Boolean).map(Date.parse)
  return times.length ? Math.max(...times) : null
}

/** How old the snapshot is: the newer of its `updated_at` and the loop's heartbeats. */
export function slotsFreshness(model, heartbeats, nowMs) {
  const seenMs = newestStampOf([model.updatedAt, ...heartbeats])
  if (seenMs === null) return { seenAt: null, ageMin: null, isStale: true }
  const ageMin = Math.max(0, Math.floor((nowMs - seenMs) / MINUTE_MS))
  return { seenAt: new Date(seenMs).toISOString(), ageMin, isStale: ageMin > SLOTS_STALE_AFTER_MIN }
}

function usedOfSize(totals) {
  return `${totals.used}/${totals.size}`
}

/** The tab badge: `9/12 · 8/8` (Grok used/size · Claude used/size). */
export function slotsTabBadge(model) {
  return `${usedOfSize(model.totals.grok)} · ${usedOfSize(model.totals.claude)}`
}

function accountUsage(account) {
  return account.isEnabled ? `${account.id} ${usedOfSize(account)}` : `${account.id} disabled`
}

/** Claude usage per account (`A1 2/4 · A2 disabled`), or the whole pool for a single-pool snapshot. */
export function claudeUsageByAccount(model) {
  if (!model.isSplitByAccount) return usedOfSize(model.totals.claude)
  return model.accounts.map(accountUsage).join(' · ')
}
