/**
 * How an ore cell looks (docs/standards/feature-slices.md 3.9): the `ore-visuals` slice provides
 * it; with no provider, today's `oreLookOfCell` from `render/oreLook.ts` stays the look.
 */
import { oreLookOfCell, type OreLook } from '../render/oreLook'
import type { PlanetParams } from '../world/planetParams'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface OreLookProvider {
  id: string
  oreLookOfCell(params: PlanetParams, cell: number): OreLook
}

export const ORE_LOOK_REGISTRY = defineOneProviderRegistry<OreLookProvider>('oreLook')

const KERNEL_ORE_LOOK: OreLookProvider = { id: 'kernel.ore-look', oreLookOfCell }

/** The registered provider, else the kernel's look. */
export function oreLookProvider(): OreLookProvider {
  const [provider] = entriesOf(ORE_LOOK_REGISTRY)
  return provider ?? KERNEL_ORE_LOOK
}
