import { describe, expect, it } from 'vitest'
import { segmentSession } from './sessionSegments.mjs'

// Transcript lines in the shape Claude Code writes to ~/.claude/projects/<dir>/<session>.jsonl.
const T0 = Date.parse('2026-10-06T10:00:00.000Z')
function at(seconds) {
  return new Date(T0 + seconds * 1000).toISOString()
}
function entry(type, seconds, content, extra = {}) {
  return {
    type,
    timestamp: at(seconds),
    sessionId: 's-1',
    gitBranch: 'ticket/7',
    isSidechain: false,
    message: { role: type, model: type === 'assistant' ? 'claude-opus-5-5' : undefined, content },
    ...extra,
  }
}
function prompt(seconds, text) {
  return entry('user', seconds, text)
}
function thinking(seconds) {
  return entry('assistant', seconds, [{ type: 'thinking', thinking: '' }])
}
function text(seconds, words) {
  return entry('assistant', seconds, [{ type: 'text', text: words }])
}
function call(seconds, id, name, input) {
  return entry('assistant', seconds, [{ type: 'tool_use', id, name, input }])
}
function result(seconds, id) {
  return entry('user', seconds, [{ type: 'tool_result', tool_use_id: id, content: 'ok' }])
}
function notification(seconds, toolUseId) {
  return {
    type: 'queue-operation',
    operation: 'enqueue',
    timestamp: at(seconds),
    sessionId: 's-1',
    content: `<task-notification>\n<tool-use-id>${toolUseId}</tool-use-id>\n<status>completed</status>\n</task-notification>`,
  }
}

function spans(session) {
  return session.segments.map((s) => [s.category, (s.start - T0) / 1000, (s.end - T0) / 1000])
}

describe('ticket phases: session segments', () => {
  it('gives a tool call the time from its tool_use to its tool_result', () => {
    const session = segmentSession([
      prompt(0, 'do the ticket'),
      call(0, 'a', 'Read', { file_path: 'x' }),
      result(4, 'a'),
    ])
    expect(spans(session)).toEqual([['context', 0, 4]])
  })

  it('gives the model time before a call to that call, thinking and text included', () => {
    const session = segmentSession([
      prompt(0, 'go'),
      call(1, 'a', 'Read', { file_path: 'x' }),
      result(2, 'a'),
      thinking(10),
      text(12, 'Editing now.'),
      call(15, 'b', 'Edit', { file_path: 'x' }),
      result(16, 'b'),
    ])
    expect(spans(session)).toEqual([
      ['context', 0, 2],
      ['developing', 2, 16],
    ])
  })

  it('counts a reply with no tool call as planning', () => {
    const session = segmentSession([
      prompt(0, 'go'),
      call(1, 'a', 'Bash', { command: 'npm test' }),
      result(31, 'a'),
      thinking(40),
      text(50, 'All green, done.'),
    ])
    expect(spans(session)).toEqual([
      ['testing', 0, 31],
      ['planning', 31, 50],
    ])
  })

  it('gives parallel calls one timeline, never counting the same second twice', () => {
    const session = segmentSession([
      prompt(0, 'go'),
      call(1, 'a', 'Bash', { command: 'gh issue view 7' }),
      call(1, 'b', 'Bash', { command: 'npm test' }),
      result(3, 'a'),
      result(20, 'b'),
    ])
    expect(spans(session)).toEqual([
      ['context', 0, 3],
      ['testing', 3, 20],
    ])
    const total = session.segments.reduce((sum, s) => sum + (s.end - s.start), 0)
    expect(total).toBe(20_000)
  })

  it('gives the wait for a background run to the call that started it', () => {
    const session = segmentSession([
      prompt(0, 'go'),
      call(1, 'bg', 'Bash', { command: 'npm run balance:report', run_in_background: true }),
      result(2, 'bg'),
      text(3, 'Waiting for the report.'),
      notification(600, 'bg'),
      thinking(605),
      call(606, 'c', 'Read', { file_path: 'report.txt' }),
      result(607, 'c'),
    ])
    expect(spans(session)).toEqual([
      ['testing', 0, 2],
      ['planning', 2, 3],
      ['testing', 3, 600],
      ['context', 600, 607],
    ])
  })

  it('skips subagent lines and reads the model, branch and session window', () => {
    const sidechain = call(5, 'z', 'Edit', { file_path: 'y' })
    sidechain.isSidechain = true
    const session = segmentSession([
      prompt(0, 'go'),
      call(1, 'a', 'Grep', { pattern: 'x' }),
      sidechain,
      result(9, 'a'),
    ])
    expect(spans(session)).toEqual([['context', 0, 9]])
    expect(session).toMatchObject({
      sessionId: 's-1',
      model: 'claude-opus-5-5',
      branch: 'ticket/7',
      start: T0,
      end: T0 + 9000,
    })
  })

  it('returns no segments for a transcript with no turns', () => {
    expect(segmentSession([]).segments).toEqual([])
  })
})
