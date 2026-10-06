// The loop driver logs, read for the ticket phases (#134). Pure: the text of a driver.log in,
// one event per line that matters out. Both loops are read the same way: the build loop
// (steampunk-loop/next-ticket.sh) and the perf loop (perf-loop/next-perf.sh) phrase the same
// moments differently. Their stamps are wall-clock minutes with a zone name.

const STAMPED_LINE = /^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) ([A-Z]+)\] (.*)$/
const ZONE_OFFSETS = { UTC: 'Z', GMT: 'Z', CET: '+01:00', CEST: '+02:00' }

// One line can be two events: "#N verified ...; pushing" ends the gates and starts the landing.
const LINE_RULES = [
  { kind: 'tier', pattern: /#(\d+)\b.*?\btier=(\S+) model=(\S+)/ },
  { kind: 'gates-end', pattern: /#(\d+):? (?:verified|NOT accepted)\b/ },
  { kind: 'landing-start', pattern: /#(\d+) verified\b.*\b(?:pushing|landing)\b/ },
  { kind: 'landing-start', pattern: /push lock acquired for #(\d+)|#(\d+): push lock acquired/ },
  { kind: 'landing-start', pattern: /recovering push_pending for #(\d+)|manual land #(\d+)/ },
  { kind: 'landing-stop', pattern: /FAILED for #(\d+)|#(\d+) push failed/ },
]

/** `2026-10-06 13:47 CEST` -> epoch ms, or null for a zone the loops never write. */
export function parseLoopStamp(stamp) {
  const [date, time, zone] = stamp.split(' ')
  const offset = ZONE_OFFSETS[zone]
  if (offset === undefined) return null
  const ms = Date.parse(`${date}T${time}:00${offset}`)
  return Number.isFinite(ms) ? ms : null
}

function ticketOf(match) {
  return Number(match.slice(1).find((group) => group !== undefined))
}

function eventOfRule(rule, message, at) {
  const match = rule.pattern.exec(message)
  if (!match) return null
  const event = { ticket: ticketOf(match), at, kind: rule.kind }
  return rule.kind === 'tier' ? { ...event, tier: match[2], model: match[3] } : event
}

function eventsOfLine(line) {
  const stamped = STAMPED_LINE.exec(line)
  if (!stamped) return []
  const at = parseLoopStamp(`${stamped[1]} ${stamped[2]} ${stamped[3]}`)
  if (at === null) return []
  return LINE_RULES.map((rule) => eventOfRule(rule, stamped[4], at)).filter(Boolean)
}

/**
 * A driver.log's text -> `[{ ticket, at, kind }]` in file order. Kinds: `tier` (with `tier` and
 * `model`), `gates-end` (verified or not accepted), `landing-start` (verified for landing, push
 * lock taken, push_pending recovery, manual land) and `landing-stop` (rebase or push failed).
 */
export function parseDriverLog(text) {
  return text.split('\n').flatMap(eventsOfLine)
}
