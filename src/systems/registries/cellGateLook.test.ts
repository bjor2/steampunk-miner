import { describe, expect, it } from 'vitest'
import {
  CELL_GATE_LOOK_REGISTRY,
  cellGateLookProvider,
  type CellGateLookProvider,
} from './cellGateLook'
import { addToRegistry, RegistrationRefusedError, withFreshRegistrySet } from './seal'

function lockedEverywhere(id: string): CellGateLookProvider {
  return { id, cellGateLookOf: () => ({ kind: 0, state: 0 }), markerTintOf: () => null }
}

describe('cell gate look registry', () => {
  it('has no provider, so no cell shows a gate, when none is registered', () => {
    expect(withFreshRegistrySet(() => undefined, cellGateLookProvider)).toBeNull()
  })

  it('answers with the registered provider', () => {
    const provider = lockedEverywhere('mining-gates.cell-gate-look')
    const answered = withFreshRegistrySet(
      () => addToRegistry(CELL_GATE_LOOK_REGISTRY, 'mining-gates', provider),
      cellGateLookProvider,
    )
    expect(answered).toBe(provider)
  })

  it('refuses a second provider at the seal', () => {
    const fillTwo = () => {
      addToRegistry(CELL_GATE_LOOK_REGISTRY, 'mining-gates', lockedEverywhere('mining-gates.look'))
      addToRegistry(CELL_GATE_LOOK_REGISTRY, 'ore-visuals', lockedEverywhere('ore-visuals.look'))
    }
    expect(() => withFreshRegistrySet(fillTwo, () => undefined)).toThrow(RegistrationRefusedError)
  })
})
