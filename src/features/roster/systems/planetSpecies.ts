/**
 * The species a kind slot shows on a planet (ticket 542, TD shape on #453, 6236465674): the row of
 * the planet's pool bound to the slot's descriptor, `(pool, family, rarity, gradeBand)` with the
 * slot id telling apart two slots of one family, rarity and window (`legacy.c4` and `legacy.c5`).
 * Found from the descriptor a cell's stored slot reads back as, never from the stored number or a
 * row's position, so choosing a pool per planet changes no cell. A row binds only under the ore
 * rules span it names (ticket 736), so a pool may swap one slot's species at a rules version and a
 * planet a save holds under older rules keeps the species it was entered with. Look only.
 */
import { isSpeciesBoundUnder, MATERIALS, type Material } from '../../materials'
import type { KindSlot } from '../../ores'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { poolOfPlanet, rosterKindOf } from './planetRoster'

/**
 * The species of `pool` bound to `slot` on a planet entered under ore rules `oreRulesVersion`; null
 * when the pool holds none for it under those rules.
 */
export function speciesOfKind(
  pool: string,
  slot: KindSlot,
  oreRulesVersion: number | undefined,
  materials: readonly Material[] = MATERIALS.materials,
): Material | null {
  const bound = (material: Material) => isSpeciesBoundUnder(material, oreRulesVersion)
  return (
    materials.find((material) => isSpeciesOfKind(material, pool, slot) && bound(material)) ?? null
  )
}

/** The species a cell's stored kind slot wears on its planet; null for no kind or no pool (P8+). */
export function planetSpeciesOf(params: PlanetParams, kindSlot: number): Material | null {
  const pool = poolOfPlanet(params)
  const kind = rosterKindOf(params, kindSlot)
  if (pool === null || kind === null) return null
  return speciesOfKind(pool, kind, params.oreRulesVersion)
}

function isSpeciesOfKind(material: Material, pool: string, slot: KindSlot): boolean {
  return material.pool === pool && material.slot === slot.slotId && isSameDescriptor(material, slot)
}

function isSameDescriptor(material: Material, slot: KindSlot): boolean {
  const [first, last] = material.gradeBand
  return (
    material.family === slot.family &&
    material.rarity === slot.rarity &&
    first === slot.window[0] &&
    last === slot.window[1]
  )
}
