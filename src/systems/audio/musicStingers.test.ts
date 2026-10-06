import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import { musicStingersOf } from './musicStingers'

const docked = (playerId: string): DomainEvent => ({
  playerId,
  tick: 10,
  seq: 1,
  type: 'DockEntered',
  bay: 'sell',
  cargoUnits: 3,
  energy: 100,
  hull: '50',
})

const coreReached: DomainEvent = { tick: 20, type: 'CoreReached' }

const coreTileBroken: DomainEvent = {
  tick: 21,
  type: 'CoreTileHarvested',
  tilesRemaining: 154,
  fragments: 1,
}

describe('music stingers', () => {
  it('plays one dock stinger when the local vehicle docks, none for another player', () => {
    expect(musicStingersOf([docked('p1')], 'p1')).toEqual(['dock'])
    expect(musicStingersOf([docked('p2')], 'p1')).toEqual([])
  })

  it('plays the core stinger on the first core fragment only', () => {
    expect(musicStingersOf([coreReached, coreTileBroken, coreTileBroken], 'p1')).toEqual(['core'])
  })

  it('plays the reveal stinger when the Refinery bay bolts on, not for a planet gate', () => {
    const unlocked = (featureId: string): DomainEvent => ({
      playerId: 'p1',
      tick: 30,
      seq: 2,
      type: 'FeatureUnlocked',
      featureId,
    })
    expect(musicStingersOf([unlocked('refinery_bay')], 'p1')).toEqual(['reveal'])
    expect(musicStingersOf([unlocked('planet_2')], 'p1')).toEqual([])
  })

  it('plays the archetype stinger on arriving at the heat planets, not for their lining (#113)', () => {
    const unlocked = (featureId: string): DomainEvent => ({
      playerId: 'p1',
      tick: 40,
      seq: 3,
      type: 'FeatureUnlocked',
      featureId,
    })
    expect(musicStingersOf([unlocked('heat_lava'), unlocked('refractory_lining')], 'p1')).toEqual([
      'archetype',
    ])
  })

  it('keeps the order the events happened in', () => {
    expect(musicStingersOf([coreReached, docked('p1')], 'p1')).toEqual(['core', 'dock'])
  })
})
