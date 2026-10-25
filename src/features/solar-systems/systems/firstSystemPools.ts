/**
 * The generated material pools of system 1 from P6 (ticket 888, the GD lock of 25 Oct 2026 on the
 * Materials Expansion, M1): the #777 generator, run on the first system's planets past the five
 * authored ones, so P6 to P40 and every planet after draw generated species instead of
 * `foothold-p6-p7` (P6 and P7) or none (P8 on).
 *
 * - **Kinds and gems.** As a later system's (`materialPool.ts`): cut from the planet's own ore mix,
 *   whose families are its act's (#141), with the three rarest sold at `t_top + 5/6/8` of its
 *   campaign index. System 1's index is its place, so value keys on `g` here too.
 * - **New family.** None: the first system's acts are its own, and Progression's new families
 *   belong to the drawn systems (`newContentSlots.ts`).
 * - **Looks.** The look walk runs over the act's run of planets from P6 (`lookGroupOf`), so no two
 *   planets of an act share a silhouette + pattern pair, as no two planets of a drawn system do,
 *   and the walk stays bounded however far the line runs: from P41 the endless acts cycle one
 *   planet each. Every pick hashes the address `(1, p)`, never the planet index.
 * - **Ids.** `system1-p<p>-<slot>`, as every generated kind: stable and never reused.
 *
 * Pure. A place before P6 is refused: P1 to P5 keep their authored pools byte for byte.
 */
import { planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import { FIRST_SYSTEM, toIndexText } from '../../../systems/starMap/planetAddress'
import { GENERATED_POOLS_FIRST_PLANET } from '../../../systems/world/planetParams'
import { actOf } from '../../planet-mix'
import type { Money } from '../../../systems/money'
import {
  planetMaterialPoolOf,
  poolDraftOf,
  poolMixOf,
  poolOf,
  type MaterialPool,
  type PoolDraft,
  type PoolPlanet,
} from './materialPool'
import { MATERIAL_POOL_RULES, type MaterialPoolRules } from './materialPoolRules'
import { poolOreValueOf, type RunSale } from './poolGemShare'
import { placedKindLooksOf } from './poolKindLooks'

/** The pool of system 1's place `place` (from P6) under ore rules `oreRulesVersion`. */
export function firstSystemPoolOf(
  worldSeed: number,
  place: number,
  oreRulesVersion?: number,
  rules: MaterialPoolRules = MATERIAL_POOL_RULES,
): MaterialPool {
  const group = lookGroupOf(place)
  const pools = lookGroupPoolsOf(worldSeed, group, oreRulesVersion, rules)
  return pools[group.indexOf(place)]
}

/** The pools of the look group holding `place`, in place order. */
export function lookGroupPoolsOf(
  worldSeed: number,
  group: readonly number[],
  oreRulesVersion?: number,
  rules: MaterialPoolRules = MATERIAL_POOL_RULES,
): MaterialPool[] {
  const drafts = group.map((place) => draftOfPlace(worldSeed, place, oreRulesVersion, rules))
  const counts = drafts.map((draft) => draft.kinds.length)
  const looks = placedKindLooksOf(worldSeed, FIRST_SYSTEM, group, counts)
  return drafts.map((draft, at) => poolOf(draft, looks[at]))
}

/**
 * The places of system 1 whose looks are walked together with `place`'s: the run of consecutive
 * planets of its act, from P6.
 */
export function lookGroupOf(place: number): number[] {
  assertGeneratedPlace(place)
  const act = actOf(place).id
  const isOfAct = (candidate: number) =>
    candidate >= GENERATED_POOLS_FIRST_PLANET && actOf(candidate).id === act
  let first = place
  while (isOfAct(first - 1)) first -= 1
  let last = place
  while (isOfAct(last + 1)) last += 1
  return Array.from({ length: last - first + 1 }, (_, at) => first + at)
}

function draftOfPlace(
  worldSeed: number,
  place: number,
  oreRulesVersion: number | undefined,
  rules: MaterialPoolRules,
): PoolDraft {
  return poolDraftOf(worldSeed, FIRST_SYSTEM, poolPlanetOf(place), { rules, oreRulesVersion })
}

/** System 1's planet as the generator reads it: its campaign index is its place. */
function poolPlanetOf(place: number): PoolPlanet {
  const text = toIndexText(BigInt(place))
  return {
    id: { system: toIndexText(FIRST_SYSTEM), planet: text },
    campaignIndex: text,
    act: actOf(place).id,
    slot: null,
  }
}

function assertGeneratedPlace(place: number): void {
  if (!Number.isSafeInteger(place) || place < GENERATED_POOLS_FIRST_PLANET) {
    throw new RangeError(
      `system 1 place ${place} keeps its authored pool: generated pools start at P${GENERATED_POOLS_FIRST_PLANET}`,
    )
  }
}

/**
 * The generated pool at address `(system, place)` under ore rules `oreRulesVersion`, whichever
 * system it is in: the roster's one read (ticket 888). Throws for system 1's P1 to P5 and a place
 * a drawn system lacks.
 */
export function materialPoolAt(
  worldSeed: number,
  system: bigint,
  place: bigint,
  oreRulesVersion?: number,
): MaterialPool {
  if (system !== FIRST_SYSTEM)
    return planetMaterialPoolOf(worldSeed, system, place, oreRulesVersion)
  return firstSystemPoolOf(worldSeed, planetIndexOfCampaign(place), oreRulesVersion)
}

/**
 * The paper ore value of the generated pool at `(system, place)`, gems at their sale tiers, per
 * share of the disc (`poolGemShare.ts`): the VS's R3 reads it times the radius squared (ticket 888).
 */
export function poolOreValueAt(
  worldSeed: number,
  system: bigint,
  place: bigint,
  oreRulesVersion?: number,
): Money {
  const pool = materialPoolAt(worldSeed, system, place, oreRulesVersion)
  const planet = { id: pool.planet, campaignIndex: pool.campaignIndex, act: pool.act, slot: null }
  return poolOreValueOf(poolMixOf(worldSeed, system, planet, oreRulesVersion), runSalesOfPool(pool))
}

/** The pool's kinds as the runs they were split from: one per family and lead. */
function runSalesOfPool(pool: MaterialPool): RunSale[] {
  const runs = new Map<string, RunSale>()
  for (const kind of pool.kinds) {
    const key = `${kind.family}+${kind.lead}`
    const held = runs.get(key) ?? {
      family: kind.family,
      lead: kind.lead,
      kinds: 0,
      gemSaleTiers: [],
    }
    const gemSaleTiers =
      kind.gemSaleTier === null ? held.gemSaleTiers : [...held.gemSaleTiers, kind.gemSaleTier]
    runs.set(key, { ...held, kinds: held.kinds + 1, gemSaleTiers })
  }
  return [...runs.values()]
}
