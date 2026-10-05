import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import type { HintMoment } from './hintConditions'
import {
  dismissTransmission,
  EMPTY_TRANSMISSION_BOARD,
  observeTransmissions,
  type TransmissionStep,
} from './transmissionBoard'

const PLANET_1 = createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })
const PLANET_2 = createAuthorityState({ planetIndex: 2, planetSeed: 1, playerIds: ['p1'] })
const FRESH: TransmissionStep = { board: EMPTY_TRANSMISSION_BOARD, seen: [] }

const stamp = { playerId: 'p1', tick: 10, seq: 1 }
const coreReached: DomainEvent = { ...stamp, type: 'CoreReached' }
const enteredPlanet: DomainEvent = {
  ...stamp,
  type: 'PlanetEntered',
  planetSeed: 1,
  generatorVersion: 1,
  radius: 300,
}

const momentOf = (events: DomainEvent[], state = PLANET_1): HintMoment => ({
  state,
  playerId: 'p1',
  events,
})

describe('transmissions', () => {
  it('shows the opening transmission at the first moment of the run', () => {
    const step = observeTransmissions(FRESH, momentOf([]))
    expect(step.board.shown).toBe('transmission_opening')
    expect(step.seen).toEqual(['transmission_opening'])
  })

  it('takes a transmission down on any key and shows it only once', () => {
    const opened = observeTransmissions(FRESH, momentOf([]))
    const later = observeTransmissions(dismissTransmission(opened), momentOf([]))
    expect(later.board.shown).toBeNull()
  })

  it('shows the core transmission when the core is reached', () => {
    const opened = dismissTransmission(observeTransmissions(FRESH, momentOf([])))
    expect(observeTransmissions(opened, momentOf([coreReached])).board.shown).toBe(
      'transmission_core_reached',
    )
  })

  it('shows the planet 2 transmission on arrival there, not on entering planet 1', () => {
    const opened = dismissTransmission(observeTransmissions(FRESH, momentOf([])))
    expect(observeTransmissions(opened, momentOf([enteredPlanet])).board.shown).toBeNull()
    expect(observeTransmissions(opened, momentOf([enteredPlanet], PLANET_2)).board.shown).toBe(
      'transmission_planet_2',
    )
  })

  it('queues a transmission behind the one shown and shows it after the key', () => {
    const both = observeTransmissions(FRESH, momentOf([coreReached]))
    expect(both.board).toEqual({
      queued: ['transmission_core_reached'],
      shown: 'transmission_opening',
    })
    expect(dismissTransmission(both).board.shown).toBe('transmission_core_reached')
  })

  it('shows nothing the restored seen-set already holds', () => {
    const seen = ['transmission_opening', 'transmission_core_reached']
    const step = observeTransmissions({ ...FRESH, seen }, momentOf([coreReached]))
    expect(step.board.shown).toBeNull()
  })
})
