import { describe, expect, it } from 'vitest'
import { oreLookOfCell } from '../render/oreLook'
import { planetParamsFor } from '../world/planetParams'
import { oreCell, RESOURCE_FAMILY } from '../world/worldCell'
import { ORE_LOOK_REGISTRY, oreLookProvider } from './oreLook'
import { addToRegistry, withFreshRegistrySet } from './seal'

const PARAMS = planetParamsFor(83921, 1)
const CELL = oreCell(RESOURCE_FAMILY.crystal, 2)

describe('ore look registry', () => {
  it("keeps today's ore look with no provider", () => {
    const look = withFreshRegistrySet(
      () => undefined,
      () => oreLookProvider().oreLookOfCell(PARAMS, CELL),
    )
    expect(look).toEqual(oreLookOfCell(PARAMS, CELL))
  })

  it("answers with the provider's look when one is registered", () => {
    const flat = { silhouette: 'vein', colour: [0, 0, 0], glow: 0, sparkles: 0 }
    const look = withFreshRegistrySet(
      () =>
        addToRegistry(ORE_LOOK_REGISTRY, 'ore-visuals', {
          id: 'ore-visuals.look',
          oreLookOfCell: () => flat as unknown as ReturnType<typeof oreLookOfCell>,
        }),
      () => oreLookProvider().oreLookOfCell(PARAMS, CELL),
    )
    expect(look).toBe(flat)
  })
})
