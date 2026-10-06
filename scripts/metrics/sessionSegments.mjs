// One Claude Code session's time, split into phase categories (#134). Pure: the parsed lines of a
// transcript (~/.claude/projects/<dir>/<session>.jsonl) in, timed segments out.
//
// The ticket's timing rule: a tool call's time runs from its tool_use to its tool_result and goes
// to that call's category; the model time between a tool_result and the next tool_use goes to that
// next call; a reply with no call (thinking, a written plan, the closing summary) is planning.
// Parallel calls share one timeline (the earliest open call owns the overlap), so no second counts
// twice. The wait for a background run ends with a task notification that names the run's
// tool_use, and goes to that run's category. Subagent (sidechain) lines are covered by their
// Agent call in the main transcript and skipped.
import { classifyToolCall } from './classifyToolCall.mjs'

const NOTIFIED_TOOL_USE = /<tool-use-id>([^<]+)<\/tool-use-id>/
const SYNTHETIC_MODEL = '<synthetic>'

function isMainTurn(entry) {
  const isTurn = entry.type === 'user' || entry.type === 'assistant'
  return isTurn && !entry.isSidechain && !entry.isMeta && typeof entry.timestamp === 'string'
}

function isTaskNotification(entry) {
  return (
    entry.type === 'queue-operation' &&
    entry.operation === 'enqueue' &&
    NOTIFIED_TOOL_USE.test(String(entry.content ?? ''))
  )
}

function blocksOf(entry) {
  const content = entry.message?.content
  return Array.isArray(content) ? content : []
}

function eventOfAssistantBlock(block, at) {
  if (block.type !== 'tool_use') return { kind: 'model', at }
  return { kind: 'call', at, id: block.id, category: classifyToolCall(block.name, block.input) }
}

function eventsOfUserTurn(entry, at) {
  const results = blocksOf(entry).filter((block) => block.type === 'tool_result')
  if (results.length === 0) return [{ kind: 'prompt', at }]
  return results.map((block) => ({ kind: 'result', at, id: block.tool_use_id }))
}

function eventsOfEntry(entry) {
  const at = Date.parse(entry.timestamp)
  if (!Number.isFinite(at)) return []
  if (isTaskNotification(entry)) {
    return [{ kind: 'notification', at, id: NOTIFIED_TOOL_USE.exec(entry.content)[1] }]
  }
  if (!isMainTurn(entry)) return []
  if (entry.type === 'user') return eventsOfUserTurn(entry, at)
  return blocksOf(entry).map((block) => eventOfAssistantBlock(block, at))
}

// Stable: lines written in the same millisecond keep their file order.
function timelineOf(entries) {
  return entries
    .flatMap(eventsOfEntry)
    .map((event, order) => ({ ...event, order }))
    .sort((a, b) => a.at - b.at || a.order - b.order)
}

function callsById(events) {
  return new Map(events.filter((event) => event.kind === 'call').map((event) => [event.id, event]))
}

/** The model's time from `from` on: the next call of the same reply, else planning. */
function categoryOfModelTime(events, from, calls) {
  for (let index = from; index < events.length; index += 1) {
    const event = events[index]
    if (event.kind === 'call') return event.category
    const isFirst = index === from
    if (event.kind === 'notification') {
      return isFirst ? (calls.get(event.id)?.category ?? 'other') : 'planning'
    }
    if (event.kind === 'prompt') return isFirst ? 'other' : 'planning'
  }
  return 'planning'
}

function trackOpenCall(open, event) {
  if (event.kind === 'call') open.set(event.id, event)
  if (event.kind === 'result') open.delete(event.id)
}

function categoryAfter(events, index, open, calls) {
  if (open.size > 0) return open.values().next().value.category
  return categoryOfModelTime(events, index + 1, calls)
}

function gapsOf(events) {
  const calls = callsById(events)
  const open = new Map()
  const gaps = []
  for (let index = 0; index + 1 < events.length; index += 1) {
    trackOpenCall(open, events[index])
    const start = events[index].at
    const end = events[index + 1].at
    if (end > start) gaps.push({ category: categoryAfter(events, index, open, calls), start, end })
  }
  return gaps
}

function mergeTouching(segments) {
  const merged = []
  for (const segment of segments) {
    const last = merged.at(-1)
    if (last && last.category === segment.category && last.end === segment.start) {
      last.end = segment.end
    } else merged.push({ ...segment })
  }
  return merged
}

function mostUsedModelOf(entries) {
  const counts = new Map()
  for (const entry of entries) {
    const model = entry.type === 'assistant' ? entry.message?.model : null
    if (model && model !== SYNTHETIC_MODEL) counts.set(model, (counts.get(model) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function sessionFacts(entries) {
  const turns = entries.filter(isMainTurn)
  return {
    sessionId: turns[0]?.sessionId ?? null,
    model: mostUsedModelOf(turns),
    branch: turns.find((turn) => turn.gitBranch)?.gitBranch ?? null,
  }
}

/**
 * Parsed transcript lines -> `{ sessionId, model, branch, start, end, segments }`; times are epoch
 * ms, each segment `{ category, start, end }`, touching ones of one category merged.
 */
export function segmentSession(entries) {
  const events = timelineOf(entries)
  return {
    ...sessionFacts(entries),
    start: events[0]?.at ?? null,
    end: events.at(-1)?.at ?? null,
    segments: mergeTouching(gapsOf(events)),
  }
}
