import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../../../systems/authority/authorityCommand'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { reportPoseIntent } from '../../../systems/bot/botPose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import {
  doBranchesDiffer,
  forkMixMetricOf,
  forkMixValuesOf,
  formatForkMixValue,
} from './forkMixMetrics'
import {
  emptyForkMixTally,
  tallyForkMixStep,
  type ForkMixRoles,
  type ForkMixStep,
  type ForkMixTally,
} from './forkMixTally'
import type { TechLane } from './techNode'

const VEHICLE: TilePoint = { tx: 10, ty: 50 }
const ROLES: ForkMixRoles = new Map([
  ['power.scout_item', 'ping'],
  ['power.diviner_item', 'cone'],
  ['power.phase_item', 'phase'],
  ['power.arc_item', 'arc'],
])

function at(body: DomainEventBody): DomainEvent {
  return { tick: 0, ...body } as DomainEvent
}

function cut(tx: number, ty: number, cause?: 'blast' | 'bore'): DomainEvent {
  return at({ type: 'TileDestroyed', tx, ty, kind: 'ore', ...(cause ? { cause } : {}) })
}

function cargo(amount = 1): DomainEvent {
  const ore = { resourceTier: 1, value: '5', oreId: 'copper', depthTiles: 3, chunk: '0,0' }
  return at({ type: 'CargoAdded', amount, ...ore })
}

function used(itemId: string): DomainEvent {
  const use = { playerId: 'p1', slot: 'powerup.1' as const, mark: 1, originTx: 0, originTy: 0 }
  return at({ type: 'power-up-core.PowerUpUsed', itemId, chargesLeft: 0, ...use })
}

function hit(amount: string): DomainEvent {
  const enemy = { enemyId: 'e1', source: 'drill' as const, arc: null, ticks: 1 }
  return at({ type: 'EnemyDamaged', amount, ...enemy })
}

function dockLeft(): DomainEvent {
  return at({ type: 'DockLeft', bay: 'sell', durationTicks: 10 })
}

function pose(thrustTicks: number, driveTicks: number, drillTicks: number): AuthorityCommand {
  const intent = reportPoseIntent(VEHICLE, FACING.down, { thrustTicks, driveTicks, drillTicks })
  return { playerId: 'p1', tick: 0, seq: 1, ...intent } as AuthorityCommand
}

function tallyOf(steps: readonly Partial<ForkMixStep>[]): ForkMixTally {
  const tally = emptyForkMixTally()
  for (const step of steps) {
    tallyForkMixStep(tally, { command: null, vehicleTile: VEHICLE, events: [], ...step }, ROLES)
  }
  return tally
}

function valuesOf(lane: TechLane, steps: readonly Partial<ForkMixStep>[]): number[] {
  return forkMixValuesOf(forkMixMetricOf(lane)!, tallyOf(steps))
}

// `balance:forks` (GD lock on #255, ticket 267): the six lanes' action-mix metrics off one run.
describe('tech tree: fork action-mix metrics', () => {
  it('counts a cut cell off the vehicle column as a flank cell, in basis points', () => {
    const events = [cut(10, 49), cut(10, 49), cut(9, 49), cut(11, 50)]
    expect(valuesOf('drill-gear', [{ events }])).toEqual([5000])
  })

  it('counts the thrust ticks of the pose reports as airborne', () => {
    const steps = [{ command: pose(30, 10, 0) }, { command: pose(0, 20, 60) }]
    expect(valuesOf('mobility', steps)).toEqual([2500])
  })

  it('counts a unit no cell broke for as reach, the bit unit as the bit and a blast unit as neither', () => {
    const events = [cut(10, 49), cargo(), cut(10, 48, 'blast'), cargo(), cargo(3)]
    expect(valuesOf('extraction', [{ events }])).toEqual([7500])
  })

  it('reads wide pings per trip and cone reads per cut cell from the branch items', () => {
    const scout = [{ events: [dockLeft(), used('power.scout_item'), used('power.scout_item')] }]
    expect(valuesOf('sensing', scout)).toEqual([2000, 0])
    const diviner = [{ events: [dockLeft(), cut(10, 49), cut(10, 48), used('power.diviner_item')] }]
    expect(valuesOf('sensing', diviner)).toEqual([0, 500])
  })

  it('counts the cells a blast opened of every opened cell', () => {
    const events = [cut(10, 49), cut(4, 40, 'blast'), cut(5, 40, 'blast'), cut(6, 40, 'bore')]
    expect(valuesOf('terrain', [{ events }])).toEqual([5000])
  })

  it('counts phases against descent cells, and the enemy damage of a step with an arc as the arc', () => {
    const phase = [{ events: [cut(10, 49), cut(10, 48), cut(11, 50), used('power.phase_item')] }]
    expect(valuesOf('aetheric', phase)).toEqual([3333, 0])
    const arc = [{ events: [hit('30')] }, { events: [used('power.arc_item'), hit('10')] }]
    expect(valuesOf('aetheric', arc)).toEqual([0, 2500])
  })

  it('ignores the uses of an item no branch role names', () => {
    expect(valuesOf('sensing', [{ events: [dockLeft(), used('power.other')] }])).toEqual([0, 0])
  })

  it('reads 0 for every part of a run that counted nothing', () => {
    expect(
      ['drill-gear', 'mobility', 'extraction', 'terrain'].map((lane) =>
        valuesOf(lane as TechLane, []),
      ),
    ).toEqual([[0], [0], [0], [0]])
  })

  it('passes a pair whose branches differ in any part, and fails equal values', () => {
    expect(doBranchesDiffer([0, 500], [2000, 0])).toBe(true)
    expect(doBranchesDiffer([0, 500], [0, 501])).toBe(true)
    expect(doBranchesDiffer([1200], [1200])).toBe(false)
  })

  it('prints a share as a percentage and a rate to three places', () => {
    expect(formatForkMixValue('bp', 3333)).toBe('33.33%')
    expect(formatForkMixValue('milli', 2000)).toBe('2.000')
  })

  it('has a metric for every lane that forks', () => {
    const lanes = [
      'extraction',
      'terrain',
      'sensing',
      'mobility',
      'drill-gear',
      'aetheric',
    ] as const
    expect(lanes.filter((lane) => forkMixMetricOf(lane) === null)).toEqual([])
  })
})
