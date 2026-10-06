import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  claimStartsOf,
  labelAppliedAt,
  loopClaimsOf,
  loopFactsOf,
  sessionOf,
  startedAtOf,
} from './issueClaims.mjs'

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/issue-buckets.json', import.meta.url), 'utf8'),
)

function withoutSlots() {
  return loopClaimsOf(FIXTURE.loops, null)
}

describe('issue loop claims', () => {
  it('claims each issue a working loop slot or a planner slot holds, and no other', () => {
    expect([...loopClaimsOf(FIXTURE.loops, FIXTURE.slots).keys()].sort()).toEqual([174, 191, 194])
  })

  it('names the Grok and Claude slot, account and claim time from the published slots', () => {
    expect(loopClaimsOf(FIXTURE.loops, FIXTURE.slots).get(194)).toEqual({
      loop: 'steampunk-loop',
      slot: '1',
      kind: 'dev',
      grokSlot: 1,
      claudeSlot: 'C1',
      account: 'Claude Max 1',
      model: null,
      effort: null,
      claimedAt: '2026-10-06T22:29:00+02:00',
    })
  })

  it('gives a planner claim its Grok slot and the time the slot took the spec', () => {
    expect(loopClaimsOf(FIXTURE.loops, FIXTURE.slots).get(191)).toMatchObject({
      kind: 'planner',
      grokSlot: '10',
      claudeSlot: null,
      claimedAt: '2026-10-06T21:51:39+02:00',
    })
  })

  it('takes the claim time from the event log when no slots snapshot is published', () => {
    expect(withoutSlots().get(194).claimedAt).toBe('2026-10-06T20:29:55Z')
    expect(withoutSlots().get(174).claimedAt).toBeNull()
  })

  it('ignores a snapshot seat in another slot than the live entry', () => {
    const slots = structuredClone(FIXTURE.slots)
    slots.accounts[0].slots[0].slot = 'C3'
    expect(loopClaimsOf(FIXTURE.loops, slots).get(194)).toMatchObject({
      claudeSlot: null,
      account: null,
      claimedAt: '2026-10-06T22:29:00+02:00',
    })
  })

  it('reads a loop entry that publishes its own account, model and effort', () => {
    const loops = structuredClone(FIXTURE.loops)
    loops.entries['steampunk-loop/1'].extra = {
      account: 'Claude Max 2',
      model: 'opus',
      effort: 'high',
      claimed_at: '2026-10-06T20:29:30Z',
    }
    expect(loopClaimsOf(loops, FIXTURE.slots).get(194)).toMatchObject({
      account: 'Claude Max 2',
      model: 'opus',
      effort: 'high',
      claimedAt: '2026-10-06T20:29:30Z',
    })
  })

  it('reads the v1 slots snapshot with one Claude pool', () => {
    const slots = {
      claude: [
        { slot: 1, state: 'busy', ticket: 194, grok_slot: 1, since: '2026-10-06T20:29:00Z' },
      ],
    }
    expect(loopClaimsOf(FIXTURE.loops, slots).get(194)).toMatchObject({
      claudeSlot: 'C1',
      grokSlot: 1,
      claimedAt: '2026-10-06T20:29:00Z',
    })
  })

  it('claims nothing when loops.json is missing', () => {
    expect(loopClaimsOf(null, null).size).toBe(0)
    expect(loopFactsOf(null)).toEqual({
      attempts: {},
      maxAttempts: Infinity,
      pushPending: null,
      planner: [],
    })
  })

  it('reads attempts, the attempt cap and push_pending from the coordinator entry', () => {
    const facts = loopFactsOf(FIXTURE.loops)
    expect(facts.attempts[196]).toBe(2)
    expect(facts.maxAttempts).toBe(2)
    expect(facts.pushPending).toEqual({ ticket: 174, branch: 'ticket/174' })
  })
})

describe('issue started time', () => {
  it('starts a slot run at its first working event, not at a later re-report', () => {
    const events = [
      { at: '2026-10-06T20:40:00Z', key: 'loop/1', state: 'working', issue: 7 },
      { at: '2026-10-06T20:30:00Z', key: 'loop/1', state: 'working', issue: 7 },
      { at: '2026-10-06T20:20:00Z', key: 'loop/1', state: 'idle', issue: null },
      { at: '2026-10-06T20:00:00Z', key: 'loop/1', state: 'working', issue: 7 },
    ]
    expect(claimStartsOf(events).get(7)).toBe('2026-10-06T20:30:00Z')
  })

  it('prefers the loop claim time over the in-progress label time', () => {
    const issue = { inProgressAt: '2026-10-06T20:29:50Z' }
    expect(startedAtOf(issue, { claimedAt: '2026-10-06T20:29:00Z' })).toBe('2026-10-06T20:29:00Z')
    expect(startedAtOf(issue, undefined)).toBe('2026-10-06T20:29:50Z')
    expect(startedAtOf({}, { claimedAt: null })).toBeNull()
  })

  it('takes the latest time the label was applied from the issue timeline', () => {
    const nodes = [
      { createdAt: '2026-10-06T18:00:00Z', label: { name: 'in-progress' } },
      { createdAt: '2026-10-06T19:00:00Z', label: { name: 'needs-fix' } },
      { createdAt: '2026-10-06T20:00:00Z', label: { name: 'in-progress' } },
      {},
    ]
    expect(labelAppliedAt(nodes, 'in-progress')).toBe('2026-10-06T20:00:00Z')
    expect(labelAppliedAt([], 'in-progress')).toBeNull()
    expect(labelAppliedAt(undefined, 'in-progress')).toBeNull()
  })
})

describe('issue session tier', () => {
  const facts = { attempts: { 5: 2 }, maxAttempts: 2 }
  function issue(number, ...names) {
    return { number, labels: names.map((name) => ({ name })) }
  }
  const worker = { loop: 'steampunk-loop', kind: 'dev', model: null, effort: null }

  it('gives a worker the model and effort of its tier label', () => {
    expect(sessionOf(issue(1, 'tier:hard'), worker, facts)).toEqual({
      model: 'opus',
      effort: 'high',
    })
    expect(sessionOf(issue(1, 'tier:easy'), worker, facts)).toEqual({
      model: 'opus',
      effort: 'medium',
    })
    expect(sessionOf(issue(1, 'tier:fable'), worker, facts)).toEqual({
      model: 'fable',
      effort: 'high',
    })
    expect(sessionOf(issue(1), worker, facts)).toEqual({ model: 'opus', effort: 'high' })
  })

  it('runs design issues on fable and escalates an easy retry to hard', () => {
    expect(sessionOf(issue(1, 'tier:hard', 'design'), worker, facts).model).toBe('fable')
    expect(sessionOf(issue(5, 'tier:easy'), worker, facts).effort).toBe('high')
  })

  it('keeps what the loop published and gives a planner slot no session', () => {
    const published = { kind: 'dev', model: 'sonnet', effort: 'low' }
    expect(sessionOf(issue(1, 'tier:hard'), published, facts)).toEqual({
      model: 'sonnet',
      effort: 'low',
    })
    expect(sessionOf(issue(1), { kind: 'planner' }, facts)).toBeNull()
    expect(sessionOf(issue(1), { ...worker, loop: 'perf-loop' }, facts)).toBeNull()
    expect(sessionOf(issue(1), undefined, facts)).toBeNull()
  })
})
