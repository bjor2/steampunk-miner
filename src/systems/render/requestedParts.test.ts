import { describe, expect, it } from 'vitest'
import type { PartMotionRequest, PartMotionRequestSource } from '../registries/partMotionRequests'
import { createRequestedParts, foldPartRequests } from './requestedParts'

const bolt: PartMotionRequest = {
  kind: 'pose',
  attach: 'drill.housing',
  slots: ['motor-housing', 'drill-head'],
  x: 0.01,
  y: 0,
  angle: 0.2,
  glow: 0.5,
}

const nudge: PartMotionRequest = { ...bolt, attach: 'drill.head', slots: ['drill-head'], x: 0.02 }

const bigLevel: PartMotionRequest = {
  kind: 'swap',
  attach: 'hull.stack',
  partIds: ['t3-stack', 't2-stack-2'],
}

function sourceOf(id: string, requests: PartMotionRequest[]): PartMotionRequestSource {
  return { id, requestsNow: () => requests }
}

describe('requested parts', () => {
  it('adds every request on a slot together and lists the attach points they name', () => {
    const requested = createRequestedParts()
    foldPartRequests(requested, [sourceOf('a.one', [bolt]), sourceOf('b.two', [nudge])])
    expect(requested.poses.get('drill-head')).toEqual({ x: 0.03, y: 0, angle: 0.4, glow: 1 })
    expect(requested.poses.get('motor-housing')).toEqual({ x: 0.01, y: 0, angle: 0.2, glow: 0.5 })
    expect(requested.attach).toEqual(['drill.head', 'drill.housing'])
  })

  it('lets a pose go back to rest on the first step nobody asks for it', () => {
    const requested = createRequestedParts()
    const reacting = sourceOf('a.one', [bolt])
    foldPartRequests(requested, [reacting])
    foldPartRequests(requested, [])
    expect(requested.poses.get('drill-head')).toEqual({ x: 0, y: 0, angle: 0, glow: 0 })
    expect(requested.attach).toEqual([])
  })

  it('moves the swap version only when the swapped parts change', () => {
    const requested = createRequestedParts()
    foldPartRequests(requested, [sourceOf('a.one', [bigLevel])])
    const afterSwap = requested.shownVersion
    foldPartRequests(requested, [sourceOf('a.one', [bigLevel])])
    expect(requested.shownVersion).toBe(afterSwap)
    expect(requested.shownPartIds).toEqual(['t2-stack-2', 't3-stack'])
    foldPartRequests(requested, [])
    expect(requested.shownVersion).toBe(afterSwap + 1)
    expect(requested.shownPartIds).toEqual([])
  })
})
