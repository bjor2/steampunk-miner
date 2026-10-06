import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { listenForDomainEvents } from './domainEventBroadcast'
import { resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'

// A slice's store follows the session through listenForDomainEvents (feature-slices.md 3.14):
// every batch of authority events the game store follows, never a write of its own.

const game = () => useGameStore.getState()

let heard: { events: readonly DomainEvent[]; playerId: string }[]
let stopListening: () => void

beforeEach(() => {
  resetGameStore()
  heard = []
  stopListening = listenForDomainEvents((events, playerId) => heard.push({ events, playerId }))
})

afterEach(() => stopListening())

describe('domain event broadcast', () => {
  it('hands a listener the events of each command the store submits, for the local player', () => {
    game().giveMoney('1500')
    expect(heard).toHaveLength(1)
    expect(heard[0].playerId).toBe(game().playerId)
    expect(heard[0].events.length).toBeGreaterThan(0)
  })

  it('stops handing events to a listener once it stops listening', () => {
    stopListening()
    game().giveMoney('1500')
    expect(heard).toEqual([])
  })

  it('leaves the session digest as it is without a listener', () => {
    game().giveMoney('1500')
    const withListener = takeSessionSnapshot().digest
    stopListening()
    resetGameStore()
    game().giveMoney('1500')
    expect(takeSessionSnapshot().digest).toBe(withListener)
  })
})
