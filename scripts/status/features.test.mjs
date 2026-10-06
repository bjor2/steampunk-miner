import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { annotateFeatures, syncCheckOf, validateFeatures } from './features.mjs'

const FEATURE_FILE = new URL('../../docs/features/features.json', import.meta.url)

function issue(number, state, { labels = [], reason = null, children = [] } = {}) {
  return {
    number,
    title: `Issue ${number}`,
    state,
    stateReason: reason ?? (state === 'CLOSED' ? 'COMPLETED' : null),
    labels: labels.map((name) => ({ name })),
    children,
  }
}

function byNumber(...issues) {
  return new Map(issues.map((i) => [i.number, i]))
}

function feature(status, issues) {
  return { title: 'Gun turret', description: 'Shoots things.', status, issues }
}

describe('the committed feature file', () => {
  // The file is edited by hand by every agent that ships or plans a feature; this keeps it valid.
  it('is valid', () => {
    const doc = JSON.parse(readFileSync(FEATURE_FILE, 'utf8'))
    expect(validateFeatures(doc)).toEqual([])
  })
})

describe('validateFeatures', () => {
  const valid = () => ({
    title: 'Game',
    description: 'A game.',
    areas: [{ group: true, title: 'Area', description: 'An area.', children: [feature('built')] }],
  })

  it('accepts a minimal tree', () => {
    expect(validateFeatures(valid())).toEqual([])
  })

  it('names a feature with an unknown status', () => {
    const doc = valid()
    doc.areas[0].children[0].status = 'done'
    expect(validateFeatures(doc)).toEqual([
      'status must be one of built | partial | planned at Area › Gun turret',
    ])
  })

  it('wants an issue or a doc on a planned feature', () => {
    const doc = valid()
    doc.areas[0].children[0].status = 'planned'
    expect(validateFeatures(doc)).toEqual([
      'a planned feature needs an issue or a doc at Area › Gun turret',
    ])
  })

  it('rejects a misspelt key and a top-level area that is not a group', () => {
    const doc = valid()
    doc.areas[0].children[0].isues = [3]
    delete doc.areas[0].group
    expect(validateFeatures(doc)).toEqual([
      'top-level area "Area" must be a group',
      'status must be one of built | partial | planned at Area',
      'unknown key "isues" at Area › Gun turret',
    ])
  })
})

describe('syncCheckOf', () => {
  it('flags a planned feature whose work issues are all closed', () => {
    const issues = byNumber(issue(7, 'CLOSED'), issue(8, 'CLOSED'))
    expect(syncCheckOf(feature('planned', [7, 8]), issues)).toBe(
      'marked planned, but its work issues are all closed (#7 #8): built now?',
    )
  })

  it('leaves a planned feature alone while one work issue is open', () => {
    const issues = byNumber(issue(7, 'CLOSED'), issue(8, 'OPEN'))
    expect(syncCheckOf(feature('planned', [7, 8]), issues)).toBeNull()
  })

  it('ignores decision issues and umbrella issues: a closed grilling only answered a question', () => {
    const issues = byNumber(
      issue(80, 'CLOSED', { labels: ['wayfinder:grilling'] }),
      issue(90, 'CLOSED', { children: [91] }),
    )
    expect(syncCheckOf(feature('planned', [80, 90]), issues)).toBeNull()
  })

  it('flags a built feature whose work issues are all open', () => {
    const issues = byNumber(issue(5, 'OPEN', { labels: ['build'] }))
    expect(syncCheckOf(feature('built', [5]), issues)).toBe(
      'marked built, but its work issues are all still open (#5)',
    )
  })

  it('flags work closed as not planned and a missing issue', () => {
    const dropped = byNumber(issue(5, 'CLOSED', { reason: 'NOT_PLANNED' }))
    expect(syncCheckOf(feature('partial', [5]), dropped)).toBe(
      'marked partial, but its work issues were closed as not planned (#5)',
    )
    expect(syncCheckOf(feature('built', [404]), byNumber())).toBe('linked issue #404 not found')
  })

  it('stays quiet when a human marked the mismatch as known', () => {
    const issues = byNumber(issue(7, 'CLOSED'))
    const node = { ...feature('partial', [7]), ignoreSync: 'hook still unwired, see notes' }
    expect(syncCheckOf(node, issues)).toBeNull()
  })
})

describe('annotateFeatures', () => {
  it('counts features and flags, and keeps the state of every linked issue', () => {
    const doc = {
      title: 'Game',
      description: 'A game.',
      areas: [
        {
          group: true,
          title: 'Area',
          description: 'An area.',
          children: [feature('built', [1]), feature('planned', [2])],
        },
      ],
    }
    const out = annotateFeatures(doc, [issue(1, 'CLOSED'), issue(2, 'CLOSED')])
    expect(out.counts).toEqual({ features: 2, built: 1, partial: 0, planned: 1, flagged: 1 })
    expect(out.flagged).toEqual([
      {
        path: 'Area › Gun turret',
        reason: 'marked planned, but its work issues are all closed (#2): built now?',
      },
    ])
    expect(out.issues[2]).toEqual({ title: 'Issue 2', state: 'CLOSED', reason: 'COMPLETED' })
    expect(out.areas[0].children[0].sync).toBeNull()
  })
})
