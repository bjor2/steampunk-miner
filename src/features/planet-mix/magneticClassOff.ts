/**
 * The magnetic class switched off at the same planet index, all else equal (`balance:magnetic-planet`,
 * GD lock on spec #258 Q7, ticket 294): the loaded registrations without this slice's
 * `magneticGround` provider. The kernel's `hazard:magnetic` reads its fields and electrified cells
 * only there, so with it gone no field tugs and no cell shocks, while the mix, the ore, the gates and
 * every other slice stay exactly as loaded. Only specs use it.
 */
import { MAGNETIC_GROUND_REGISTRY } from '../../systems/registries/magneticGround'
import { createRegistrySet, swapRegistrySet, type RegistrySet } from '../../systems/registries/seal'

/** Runs `run` on the loaded registrations minus the magnetic ground, then puts the loaded set back. */
export function withMagneticClassOff<T>(run: () => T): T {
  const loaded = swapRegistrySet(createRegistrySet())
  try {
    swapRegistrySet(registrySetWithoutMagneticGround(loaded))
    return run()
  } finally {
    swapRegistrySet(loaded)
  }
}

/** A sealed copy of `loaded`'s shelves, which are already sorted, but the magnetic ground's. */
function registrySetWithoutMagneticGround(loaded: RegistrySet): RegistrySet {
  const shelves = new Map(loaded.shelves)
  shelves.delete(MAGNETIC_GROUND_REGISTRY)
  return { isSealed: loaded.isSealed, shelves }
}
