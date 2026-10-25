/**
 * The roster of a planet that draws its generated material pool (ticket 888, GD lock M1 on the
 * Materials Expansion, 25 Oct 2026): from ore rules 14 every planet after system 1's P5, system 1's
 * P6 on and every planet of a later system, binds its kind slots, species, looks and gems to the
 * `solar-systems` slice's pool at its address `(s, p)`, one keyed path instead of a pool per planet
 * index. A planet a save holds under older rules keeps the roster it was entered with, so P6 and P7
 * stamped 13 or earlier still draw `foothold-p6-p7` (saves only).
 *
 * - **Address.** The pool, its kinds' order and their looks key on `(s, p)` and the planet's ore
 *   rules stamp; only the gems' sale tiers key on `g`, the planet's campaign index. Nothing here
 *   reads the planet index for a layout or a look: system 1's place is its index, a later system's
 *   is `g - planetsBefore(s)`.
 * - **Slots.** One per pool kind, common first, its slot id the kind's own `system<s>-p<p>-<slot>`,
 *   so a stored cell's slot reads back the kind it was drawn as.
 * - **Species.** A kind is its own species, its procedural look the pool's (no hero art, no copy).
 *
 * One pool per planet and stamp, cached, so the per-patch fold allocates none.
 */
import { placeOfCampaign } from '../../../systems/starMap/campaignIndex'
import { FIRST_SYSTEM } from '../../../systems/starMap/planetAddress'
import { systemOfParams } from '../../../systems/starMap/systemPlanetParams'
import {
  GENERATED_POOLS_FIRST_PLANET,
  GENERATED_POOLS_ORE_RULES,
  type PlanetParams,
} from '../../../systems/world/planetParams'
import { MATERIAL_RARITIES, type Material, type MaterialRarity } from '../../materials'
import type { KindSlot } from '../../ores'
import { materialPoolAt, type MaterialPool, type PoolKind } from '../../solar-systems'

/** A generated planet's roster: its pool, the slots the fold draws and the species they wear. */
interface GeneratedRoster {
  pool: MaterialPool
  slots: readonly KindSlot[]
  species: readonly Material[]
}

const rosterByKey = new Map<string, GeneratedRoster>()

/** Whether the planet draws its generated pool: ore rules 14 or later, after system 1's P5. */
export function isGeneratedPoolPlanet(params: PlanetParams): boolean {
  const isUnderPoolRules = (params.oreRulesVersion ?? 0) >= GENERATED_POOLS_ORE_RULES
  return isUnderPoolRules && isGeneratedAddress(params)
}

/** The planet's generated pool; call only where `isGeneratedPoolPlanet` holds. */
export function generatedPoolOf(params: PlanetParams): MaterialPool {
  return generatedRosterOf(params).pool
}

/** The kind slots of the planet's generated pool, in pool order. */
export function generatedSlotsOf(params: PlanetParams): readonly KindSlot[] {
  return generatedRosterOf(params).slots
}

/** The species a stored kind slot wears on a generated planet; null for none. */
export function generatedSpeciesOf(params: PlanetParams, kindSlot: number): Material | null {
  return generatedRosterOf(params).species[kindSlot - 1] ?? null
}

/** The tier a generated kind sells at when it is one of the planet's gems; else null. */
export function generatedGemSaleTierOf(params: PlanetParams, slotId: string): number | null {
  const kind = generatedRosterOf(params).pool.kinds.find((candidate) => candidate.id === slotId)
  return kind?.gemSaleTier ?? null
}

function generatedRosterOf(params: PlanetParams): GeneratedRoster {
  const system = systemOfParams(params)
  const place = placeOf(params)
  const key = `${params.worldSeed}|${system}|${place}|${params.oreRulesVersion ?? 0}`
  const known = rosterByKey.get(key)
  if (known !== undefined) return known
  const roster = rosterOfPool(
    materialPoolAt(params.worldSeed, system, place, params.oreRulesVersion),
  )
  rosterByKey.set(key, roster)
  return roster
}

function rosterOfPool(pool: MaterialPool): GeneratedRoster {
  return Object.freeze({
    pool,
    slots: Object.freeze(pool.kinds.map(slotOfKind)),
    species: Object.freeze(pool.kinds.map((kind) => speciesOfKind(pool, kind))),
  })
}

function slotOfKind(kind: PoolKind): KindSlot {
  return { slotId: kind.id, family: kind.family, rarity: kind.rarity, window: kind.window }
}

function speciesOfKind(pool: MaterialPool, kind: PoolKind): Material {
  return {
    id: kind.id,
    pool: pool.id,
    slot: kind.id,
    family: kind.family,
    epithet: kind.epithet,
    name: kind.name,
    silhouette: kind.silhouette,
    pattern: kind.pattern,
    hueSlot: kind.hueSlot,
    gradeBand: kind.window,
    rarity: materialRarityOf(kind.rarity),
    hero: false,
    // No copy is written per generated kind (#777 choice 4); the name carries its look.
    flavour: '',
  }
}

function materialRarityOf(rarity: string): MaterialRarity {
  const known = MATERIAL_RARITIES.find((candidate) => candidate === rarity)
  if (known === undefined) throw new RangeError(`no material rarity "${rarity}"`)
  return known
}

/** System 1 from P6, and every planet of a later system. */
function isGeneratedAddress(params: PlanetParams): boolean {
  return systemOfParams(params) !== FIRST_SYSTEM || placeOf(params) >= GENERATED_POOLS_PLACE
}

const GENERATED_POOLS_PLACE = BigInt(GENERATED_POOLS_FIRST_PLANET)

/** The planet's place `p` in its system. */
function placeOf(params: PlanetParams): bigint {
  return placeOfCampaign(systemOfParams(params), BigInt(params.planetIndex))
}
