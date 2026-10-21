import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WarningFiring, WarningReading } from '../systems/views/warningWatch'
import { resetGameStore, useGameStore } from './gameStore'
import { listenForWarnings, readFiredWarnings } from './warningBroadcast'

const game = () => useGameStore.getState()

const at = (fuelPercent: number, hullPercent = 100): WarningReading[] => [
  { id: 'hull', leftPermille: hullPercent * 10 },
  { id: 'fuel', leftPermille: fuelPercent * 10 },
]

let heard: WarningFiring[] = []
let stopListening = () => {}

beforeEach(() => {
  resetGameStore()
  heard = []
  stopListening = listenForWarnings((firing) => heard.push(firing))
})

afterEach(() => stopListening())

describe('warning layer in the store (ticket 685)', () => {
  it('starts armed with no glow', () => {
    expect(game().edgeGlow).toEqual({ tier: 'ok', readoutId: null })
    expect(Object.values(game().warningWatch).every((tier) => tier === 'ok')).toBe(true)
  })

  it('announces a tier once as the readings fall into it, and records it for the debug read', () => {
    game().followWarnings(at(29))
    game().followWarnings(at(28))
    game().followWarnings(at(29))
    expect(heard.map((firing) => [firing.readoutId, firing.tier, firing.cueId])).toEqual([
      ['fuel', 'low', 'ui.warn.low'],
    ])
    expect(readFiredWarnings()).toEqual(heard)
  })

  it('holds the glow on the deepest reading and drops it once every reading is clear', () => {
    game().followWarnings(at(29, 10))
    expect(game().edgeGlow).toEqual({ tier: 'critical', readoutId: 'hull' })
    game().followWarnings(at(80, 80))
    expect(game().edgeGlow).toEqual({ tier: 'ok', readoutId: null })
  })

  it('keeps the store untouched on a quiet re-read, so nothing renders again', () => {
    game().followWarnings(at(29))
    const shown = useGameStore.getState()
    game().followWarnings(at(29))
    expect(useGameStore.getState()).toBe(shown)
  })

  it('changes nothing the authority holds and does not hold play', () => {
    const before = { money: game().money, vehicle: game().vehicle, hold: game().liveStepHold }
    game().followWarnings(at(0, 0))
    expect({ money: game().money, vehicle: game().vehicle, hold: game().liveStepHold }).toEqual(
      before,
    )
  })

  it('forgets the fired warnings and re-arms with the run', () => {
    game().followWarnings(at(0))
    resetGameStore()
    expect(readFiredWarnings()).toEqual([])
    expect(game().warningWatch.fuel).toBe('ok')
  })
})
