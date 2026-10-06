import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bucketCountsOf,
  bucketIdOf,
  bucketOf,
  issueTypeOf,
  issuesInBucket,
  isInBucket,
} from './issueBuckets.mjs'
import { loopClaimsOf, loopFactsOf } from './issueClaims.mjs'

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/issue-buckets.json', import.meta.url), 'utf8'),
)
const ISSUES = FIXTURE.issues

function contextOf(loops = FIXTURE.loops, slots = FIXTURE.slots) {
  return { claims: loopClaimsOf(loops, slots), loopFacts: loopFactsOf(loops) }
}

function issueNumbered(number) {
  return ISSUES.find((issue) => issue.number === number)
}

function bucketsByNumber(context) {
  return Object.fromEntries(ISSUES.map((issue) => [issue.number, bucketOf(issue, context)]))
}

describe('issue trees status filter', () => {
  it('puts every fixture issue in the bucket its labels, blockers and loop slots call for', () => {
    const expected = Object.fromEntries(
      Object.entries(FIXTURE.expect).map(([number, bucket]) => [Number(number), bucket]),
    )
    expect(bucketsByNumber(contextOf())).toEqual(expected)
  })

  it('counts each bucket, with open as the sum of ongoing, ready and planned', () => {
    const counts = bucketCountsOf(ISSUES, contextOf())
    expect(counts).toEqual({ open: 14, ready: 3, ongoing: 3, closed: 2, planned: 8 })
    expect(counts.ongoing + counts.ready + counts.planned).toBe(counts.open)
  })

  it('makes an issue ongoing from its in-progress label alone when no loop reports it', () => {
    const noLoops = contextOf(null, null)
    expect(bucketOf(issueNumbered(174), noLoops)).toBe('ongoing')
    expect(bucketOf(issueNumbered(194), noLoops)).toBe('ready')
  })

  it('makes a spec held by a planner slot ongoing without an in-progress label', () => {
    expect(bucketOf(issueNumbered(191), contextOf())).toBe('ongoing')
  })

  it('keeps an issue ready while its blockers are closed and the loop has attempts left', () => {
    expect(bucketOf(issueNumbered(137), contextOf())).toBe('ready')
    expect(bucketOf(issueNumbered(164), contextOf())).toBe('ready')
  })

  it('plans an issue whose loop attempts are spent until a person steps in', () => {
    expect(bucketOf(issueNumbered(196), contextOf())).toBe('planned')
    expect(bucketOf(issueNumbered(196), contextOf(null, null))).toBe('ready')
  })

  it('plans an issue blocked by an open dependency or waiting on a label', () => {
    for (const number of [148, 178, 181, 182, 190]) {
      expect(bucketOf(issueNumbered(number), contextOf())).toBe('planned')
    }
  })

  it('plans a map or plan while its sub-issues are open', () => {
    expect(bucketOf(issueNumbered(1), contextOf())).toBe('planned')
    expect(bucketOf(issueNumbered(90), contextOf())).toBe('planned')
  })

  it('lists the open bucket as every open issue', () => {
    const open = issuesInBucket(ISSUES, 'open', contextOf()).map((issue) => issue.number)
    expect(open).toEqual([1, 90, 137, 148, 164, 174, 178, 181, 182, 190, 191, 193, 194, 196])
    expect(isInBucket(issueNumbered(167), 'open', contextOf())).toBe(false)
  })

  it('lists closed issues newest closed first', () => {
    const closed = issuesInBucket(ISSUES, 'closed', contextOf()).map((issue) => issue.number)
    expect(closed).toEqual([167, 120])
  })

  it('names each issue a map, plan, spec or build, and nothing for other labels', () => {
    expect(issueTypeOf(issueNumbered(1))).toBe('map')
    expect(issueTypeOf(issueNumbered(90))).toBe('plan')
    expect(issueTypeOf(issueNumbered(191))).toBe('spec')
    expect(issueTypeOf(issueNumbered(194))).toBe('build')
    expect(issueTypeOf(issueNumbered(120))).toBe('build')
    expect(issueTypeOf({ ...issueNumbered(194), labels: [{ name: 'bug' }] })).toBeNull()
  })

  it('reads the bucket from the hash and falls back to ongoing', () => {
    expect(bucketIdOf('closed')).toBe('closed')
    expect(bucketIdOf(null)).toBe('ongoing')
    expect(bucketIdOf('everything')).toBe('ongoing')
  })
})
