import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import {
  CHARGE_BLAST_CUE_REGISTRY,
  chargeBlastKickOf,
  type ChargeBlastCueProvider,
  type ChargeBlastKick,
} from './chargeBlastCue'
import { addToRegistry, RegistrationRefusedError, withFreshRegistrySet } from './seal'

const DETONATED = {
  tick: 720,
  playerId: 'p1',
  type: 'ChargeDetonated',
  tx: 3,
  ty: 280,
  size: 5,
  radiusMm: 8000,
} as const satisfies DomainEvent

function providerKicking(kick: ChargeBlastKick, id = 'fake-blast.cue'): ChargeBlastCueProvider {
  return { id, kickOf: () => kick }
}

function kickWith(providers: readonly ChargeBlastCueProvider[], distanceMm = 0) {
  return withFreshRegistrySet(
    () =>
      providers.forEach((provider) =>
        addToRegistry(CHARGE_BLAST_CUE_REGISTRY, provider.id.split('.')[0], provider),
      ),
    () => chargeBlastKickOf(DETONATED, distanceMm),
  )
}

describe('charge blast cue', () => {
  it("kicks today's shake, no flash and no thump delay with no provider", () => {
    expect(kickWith([])).toEqual({ shake: 0.8, flash: 0, thumpDelayTicks: 0 })
  })

  it("kicks what the provider answers for the detonation and the listener's distance", () => {
    const seen: [number, number][] = []
    const provider: ChargeBlastCueProvider = {
      id: 'fake-blast.cue',
      kickOf: (detonated, distanceMm) => {
        seen.push([detonated.size, distanceMm])
        return { shake: 0.5, flash: 0.25, thumpDelayTicks: 12 }
      },
    }
    expect(kickWith([provider], 4200)).toEqual({ shake: 0.5, flash: 0.25, thumpDelayTicks: 12 })
    expect(seen).toEqual([[5, 4200]])
  })

  it('clamps the shake and flash to 0..1 and the thump to 0..60 whole ticks', () => {
    expect(kickWith([providerKicking({ shake: 3, flash: -1, thumpDelayTicks: 600 })])).toEqual({
      shake: 1,
      flash: 0,
      thumpDelayTicks: 60,
    })
    expect(kickWith([providerKicking({ shake: -2, flash: 7, thumpDelayTicks: 7.6 })])).toEqual({
      shake: 0,
      flash: 1,
      thumpDelayTicks: 8,
    })
  })

  it('takes a kick that is not a number as no kick at all', () => {
    const kick = { shake: Number.NaN, flash: Number.NaN, thumpDelayTicks: Number.NaN }
    expect(kickWith([providerKicking(kick)])).toEqual({ shake: 0, flash: 0, thumpDelayTicks: 0 })
  })

  it('refuses a second provider when the registries are sealed', () => {
    const two = [
      providerKicking({ shake: 1, flash: 0, thumpDelayTicks: 0 }, 'fake-blast.cue'),
      providerKicking({ shake: 0, flash: 1, thumpDelayTicks: 0 }, 'other-blast.cue'),
    ]
    expect(() => kickWith(two)).toThrow(RegistrationRefusedError)
  })
})
