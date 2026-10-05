import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import { musicStingersOf } from './musicStingers'

const docked = (playerId: string): DomainEvent => ({
  playerId,
  tick: 10,
  seq: 1,
  type: 'DockEntered',
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

  it('keeps the order the events happened in', () => {
    expect(musicStingersOf([coreReached, docked('p1')], 'p1')).toEqual(['core', 'dock'])
  })
})
