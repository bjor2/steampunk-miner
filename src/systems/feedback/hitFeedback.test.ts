import { describe, expect, it } from 'vitest'
import { prepareCorridor, spawnEnemy } from '../authority/combat/combatFixtures'
import type { DomainEvent } from '../authority/domainEvent'
import { createScriptedSession } from '../authority/scriptedSession'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { accentOf } from './accents'
import { cueSightOf, feedbackCuesOf, type FeedbackCue } from './feedbackCues'
import { screenEdgeOf } from './hitFrom'
import { createScreenEffects, kickScreen } from './screenEffects'

const ALL_ON = { shake: true, flashes: true }

const isHit = (event: DomainEvent) => event.type === 'VehicleDamaged'

/**
 * A tier 1 crawler `dx` tiles along the corridor from a vehicle facing `facing`, fought until it
 * lands its first hit; the cue that batch gives the local player, as the store would announce it.
 */
function firstHitCueOf(facing: Facing, dx: number): FeedbackCue {
  const session = createScriptedSession()
  const start = prepareCorridor(session, facing)
  session.submit(start, spawnEnemy('crawler', 1, dx))
  for (let tick = start + 1; tick < start + 200; tick++) {
    const batch = session.advanceTo(tick)
    if (batch.some(isHit)) {
      const [hit] = feedbackCuesOf(batch, 'p1', cueSightOf(session.state(), 'p1')).filter(
        (cue) => cue.kind === 'hit',
      )
      return hit
    }
  }
  throw new Error('the crawler never hit')
}

function flashedEdgesOf(cue: FeedbackCue) {
  const effects = createScreenEffects()
  kickScreen(effects, cue, ALL_ON)
  return { edges: effects.edgeFlash, veil: effects.flash }
}

describe('hit feedback (spec #678 G&V 2, ticket 720)', () => {
  it.each([
    ['a side hit from the right', FACING.up, 3, 'right'],
    ['a side hit from the left', FACING.up, -3, 'left'],
    ['a rear hit from the right', FACING.left, 3, 'right'],
    ['a rear hit from the left', FACING.right, -3, 'left'],
  ] as const)('flashes only its own edge for %s', (_, facing, dx, edge) => {
    const { edges, veil } = flashedEdgesOf(firstHitCueOf(facing, dx))
    const lit = Object.entries(edges)
      .filter(([, opacity]) => opacity > 0)
      .map(([side]) => side)
    expect(lit).toEqual([edge])
    expect(veil).toBe(0)
  })

  it('throws a spark burst for frontal drill contact, and flashes no edge', () => {
    const cue = firstHitCueOf(FACING.right, 3)
    expect(cue).toEqual({ kind: 'hit', from: { kind: 'drillFace' } })
    expect(accentOf(cue)).toBe('sparkBurst')
    expect(Object.values(flashedEdgesOf(cue).edges)).toEqual([0, 0, 0, 0])
  })

  it.each([
    [0, 'top'],
    [Math.PI / 2, 'right'],
    [Math.PI, 'bottom'],
    [-Math.PI / 2, 'left'],
    [-Math.PI, 'bottom'],
  ] as const)('shows a bearing of %f radians on the %s edge', (radians, edge) => {
    expect(screenEdgeOf(radians, 0)).toBe(edge)
  })
})
