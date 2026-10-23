import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { runEventProblems } from '../logging/runEventSchema'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { fuelPriceOf } from '../systems/economy/jumpFuel'
import { fromCanonical, sub, toCanonical } from '../systems/money'
import { resetGameStore, useGameStore } from './gameStore'

let sink: MemorySink

const game = () => useGameStore.getState()
const linesNamed = (name: string) => sink.events.filter((line) => line.event === name)

beforeEach(() => {
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  resetGameStore()
  game().giveMoney('1000')
  game().dock('sell')
})

afterEach(() => uninstallRunLog())

describe('star map actions (ticket 755)', () => {
  it('buys fuel into the tank the HUD reads, paid from the wallet, and logs fuel_bought', () => {
    const money = game().money
    game().buyFuel(2)
    expect(toCanonical(game().vehicle.fuel)).toBe('2e+0')
    expect(toCanonical(game().money)).toBe(toCanonical(sub(money, fuelPriceOf(1, 2))))
    expect(linesNamed('fuel_bought').map((line) => line.data)).toEqual([
      { units: 2, cost: toCanonical(fuelPriceOf(1, 2)), tank: '2e+0' },
    ])
  })

  it('jumps on the request alone and plays a 2 s transition, so control returns within 2 s', () => {
    game().buyFuel(6)
    game().jumpToPlanet(3)
    expect(game().planetTier).toBe(3)
    expect(game().travelTransition).toEqual({ fromPlanet: 1, toPlanet: 3, seconds: 2 })
    expect(toCanonical(game().vehicle.fuel)).toBe(toCanonical(fromCanonical('0')))
    expect(linesNamed('travel_started').map((line) => line.data)).toEqual([
      { fromPlanet: 1, toPlanet: 3, cost: '0e+0', coreSpent: 0, fuelSpent: '6e+0' },
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('logs a refused jump as command_rejected and changes nothing', () => {
    game().jumpToPlanet(2)
    expect(game().planetTier).toBe(1)
    expect(game().travelTransition).toBeNull()
    expect(sink.events.at(-1)).toMatchObject({
      event: 'command_rejected',
      data: { type: 'jumpToPlanet', reason: 'fuel_short' },
    })
  })
})
