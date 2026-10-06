import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import type { DomainEventBody } from '../authority/domainEvent'
import { planetParamsFor } from '../world/planetParams'
import { applyBlastEffects, BLAST_EFFECT_REGISTRY, type BlastEvent } from './blastEffects'
import { addToRegistry, withFreshRegistrySet } from './seal'

const PARAMS = planetParamsFor(83921, 1)
const START = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
const BLAST: BlastEvent = {
  tx: 3,
  ty: 40,
  radiusMm: 2500,
  size: 1,
  playerId: 'p1',
  source: 'charge',
  tick: 9,
}

/** An effect that advances the tick and reports the tick it saw, so the order shows. */
function registerTickEffect(id: string): void {
  addToRegistry(BLAST_EFFECT_REGISTRY, 'dynamite', {
    id,
    apply: (state: AuthorityState) => ({
      state: { ...state, tick: state.tick + 1 },
      events: [{ type: 'Probe', id, sawTick: state.tick } as unknown as DomainEventBody],
    }),
  })
}

describe('blast effects registry', () => {
  it('leaves the state unchanged and adds no events when nothing is registered', () => {
    const effect = withFreshRegistrySet(
      () => undefined,
      () => applyBlastEffects(START, BLAST, PARAMS),
    )
    expect(effect.state).toBe(START)
    expect(effect.events).toEqual([])
  })

  it('runs effects in id order, each on the state the one before left', () => {
    const effect = withFreshRegistrySet(
      () => {
        registerTickEffect('dynamite.second')
        registerTickEffect('dynamite.first')
      },
      () => applyBlastEffects(START, BLAST, PARAMS),
    )
    expect(effect.state.tick).toBe(START.tick + 2)
    expect(effect.events).toEqual([
      { type: 'Probe', id: 'dynamite.first', sawTick: START.tick },
      { type: 'Probe', id: 'dynamite.second', sawTick: START.tick + 1 },
    ])
  })
})
