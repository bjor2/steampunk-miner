import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import { feedbackCuesOf } from './feedbackCues'

const stamp = (playerId: string) => ({ playerId, tick: 10, seq: 1 })

const cargo = (resourceTier: number, playerId = 'p1'): DomainEvent => ({
  ...stamp(playerId),
  type: 'CargoAdded',
  resourceTier,
  amount: 1,
  value: '1',
})

const docked: DomainEvent = {
  ...stamp('p1'),
  type: 'DockEntered',
  bay: 'sell',
  cargoUnits: 3,
  energy: 100,
  hull: '50',
}

const hitByCrawler: DomainEvent = {
  tick: 12,
  type: 'VehicleDamaged',
  amount: '5',
  arc: 'side',
  enemyId: 'e1',
  kind: 'crawler',
  tier: 2,
  hullAfter: '45',
}

describe('feedback cues', () => {
  it('chimes once per batch, at the highest ore tier picked up', () => {
    expect(feedbackCuesOf([cargo(2), cargo(5), cargo(3)], 'p1')).toEqual([
      { kind: 'pickup', tier: 5 },
    ])
  })

  it('clanks on docking and shakes on a hit', () => {
    expect(feedbackCuesOf([docked, hitByCrawler], 'p1')).toEqual([
      { kind: 'dockClank' },
      { kind: 'hit' },
    ])
  })

  it('hisses as a ring lines the wall and pops as the drill clears lining', () => {
    const placed = (samples: number, relined: number): DomainEvent => ({
      ...stamp('p1'),
      type: 'CasingPlaced',
      samples,
      relined,
      grade: 2,
    })
    const drilled: DomainEvent = { ...stamp('p1'), type: 'CasingDrilled', samples: 3, grade: 2 }
    expect(feedbackCuesOf([placed(5, 0), placed(0, 2), drilled], 'p1')).toEqual([
      { kind: 'casingHiss' },
      { kind: 'casingPop' },
    ])
  })

  it('stays quiet for a ring that lined nothing new', () => {
    const idle: DomainEvent = {
      ...stamp('p1'),
      type: 'CasingPlaced',
      samples: 0,
      relined: 0,
      grade: 2,
    }
    expect(feedbackCuesOf([idle], 'p1')).toEqual([])
  })

  it("ignores another player's pickups", () => {
    expect(feedbackCuesOf([cargo(4, 'p2')], 'p1')).toEqual([])
  })

  it('has nothing to say about events with no feedback', () => {
    const digest: DomainEvent = {
      tick: 3600,
      type: 'StateDigested',
      digest: 'ab',
      scope: 'periodic',
    }
    expect(feedbackCuesOf([digest], 'p1')).toEqual([])
  })
})
