/**
 * A solar system's generated material pools (ticket 777, spec #774; the GD lock of 23 Oct 2026 on
 * Campaign Scaling with its HS and VS input): one generator from the campaign index to a pool, for
 * every planet of a system past the first, never written per planet.
 *
 * - **Kinds.** The ore mix the planet is generated with (the planet-mix slice at `g`, under the
 *   address seed `planetParamsAt` gives it) names every family it paints at every rarity lead;
 *   each such run is a kind, and the heaviest runs split until the planet holds `kindsTarget` (about
 *   15, never past the 17-kind cap; `poolRuns.ts`). A kind's window is the bands its run is painted
 *   in, so a kind is never live where the mix never paints it, rares and gems sit only from band 3
 *   (d >= 0.35, the deep rows from ore rules 11) and band 1 holds commons and its one uncommon run:
 *   scarce near the surface, with an uncommon ore within the first trip's reach.
 * - **Gems.** The three rarest kinds (`gemCount`, the ores slice's ladder), sold cheapest first at
 *   `t_top + 5/6/8` (the kernel planet row at `g`); like every rare kind they grow in the kernel's
 *   seeded clusters of 1 to 3 cells. Their paper share of the pool value is `poolGemShare.ts`'s.
 * - **New family.** The roster's slot is the planet's new enemy, hazard or ore family; an ore family
 *   is carried by the band-1 uncommon kind, so the first trip meets it.
 * - **Looks and names.** A silhouette + pattern pair no first-system species wears and a hue slot,
 *   own within the planet (`poolKindLooks.ts`); the epithet is the look's own words, so a name never
 *   repeats where a look does not, and the name is the materials slice's `<epithet> <family name>`.
 * - **Ids.** The pool is `system<s>-p<p>` and a kind `<pool>-<slot>`, the slot its rarity's initial
 *   and its place among that rarity's kinds: stable, never reused, never a display name.
 *
 * Prices stay V(t) at the kind's tier (a gem's at its sale tier); no hardness, price or drill law is
 * set here. Pure and finite at any system the campaign index keeps a safe planet index for; system 1
 * is refused here, as the roster refuses it: its planets from P6 draw through `firstSystemPools.ts`
 * (ticket 888), the same generator over the act's run of planets instead of a drawn roster.
 *
 * A pool is cut from the mix the planet is generated with under its ore rules stamp, so a planet a
 * save holds keeps the kinds its cells were drawn from; with no stamp named it is the stamp a planet
 * entered now takes.
 */
import { gemSaleTiersOfPlanet } from '../../../systems/registries/planetRow'
import { planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import { readIndexText, toIndexText } from '../../../systems/starMap/planetAddress'
import { planetParamsAt } from '../../../systems/starMap/systemPlanetParams'
import {
  RARE_CLUSTER_FIRST_LEAD,
  RARE_CLUSTER_SIZE_SHARES_PERCENT,
} from '../../../systems/world/planetTable'
import { oreRulesVersionOnEntry } from '../../../systems/world/planetParams'
import { materialNameOf } from '../../materials'
import { oreFamilies, rarityTierOf } from '../../ores'
import { oreMixOf, type OreMix } from '../../planet-mix'
import { MATERIAL_POOL_RULES, type MaterialPoolRules } from './materialPoolRules'
import type { NewContentFamily } from './paletteRows'
import { gemValueShareBpOf, type RunSale } from './poolGemShare'
import { systemKindLooksOf, type KindLook } from './poolKindLooks'
import { paintedRunsOf, splitRunsOf, type SplitRun } from './poolRuns'
import { systemRosterOf, type PlanetId, type RosterPlanet } from './systemRoster'

export interface PoolKind extends KindLook {
  /** `<pool>-<slot>`: the species id; stable and never reused. */
  id: string
  /** The rarity's initial and the kind's place among that rarity's kinds, as `c1`. */
  slot: string
  /** One of the 12 ore family ids: the cells it is drawn on, their gate class and price. */
  family: string
  rarity: string
  /** The rarity lead: tiers over the band's own ore tier. */
  lead: number
  /** The first and last band the kind is live in. */
  window: readonly [number, number]
  /** The look's own words, as "Glinting grits". */
  epithet: string
  /** `<epithet> <family name>`. */
  name: string
  /** The tier the kind sells at as a gem, cheapest gem first; null for an ore sold at its tier. */
  gemSaleTier: number | null
  /** The fewest and most cells a cluster of the kind holds; null where it paints patches. */
  clusterCells: readonly [number, number] | null
  /** The planet's new ore family when this kind carries it, else null. */
  newFamily: string | null
}

export interface MaterialPool {
  /** `system<s>-p<p>`. */
  id: string
  planet: PlanetId
  /** `g`, as canonical text. */
  campaignIndex: string
  act: string
  /** The planet's new enemy, hazard or ore family: the roster's slot. */
  newFamily: NewContentFamily | null
  /** Common first, rarest last. */
  kinds: readonly PoolKind[]
  /** The gems' share of the pool's ore value on paper, in basis points. */
  gemValueShareBp: number
}

/** What a pool reads of its planet: its address, campaign index, act and new-content slot. */
export type PoolPlanet = Pick<RosterPlanet, 'id' | 'campaignIndex' | 'act' | 'slot'>

/** A planet's pool before its looks: its kinds' ore facts and its gem share. */
export interface PoolDraft {
  roster: PoolPlanet
  kinds: readonly Omit<PoolKind, keyof KindLook | 'epithet' | 'name'>[]
  gemValueShareBp: number
}

const NEW_ORE_FAMILY_LEAD = 1
const SURFACE_BAND = 1

/** The pools of system `system` (from 2), in place order, under ore rules `oreRulesVersion`. */
export function systemMaterialPoolsOf(
  worldSeed: number,
  system: bigint,
  rules: MaterialPoolRules = MATERIAL_POOL_RULES,
  oreRulesVersion?: number,
): MaterialPool[] {
  const drafts = systemRosterOf(worldSeed, system).map((roster) =>
    poolDraftOf(worldSeed, system, roster, { rules, oreRulesVersion }),
  )
  const looks = systemKindLooksOf(
    worldSeed,
    system,
    drafts.map((draft) => draft.kinds.length),
  )
  return drafts.map((draft, at) => poolOf(draft, looks[at]))
}

/** One planet's pool; throws for system 1 or a place the system lacks. */
export function planetMaterialPoolOf(
  worldSeed: number,
  system: bigint,
  planet: bigint,
  oreRulesVersion?: number,
): MaterialPool {
  const pools = systemMaterialPoolsOf(worldSeed, system, MATERIAL_POOL_RULES, oreRulesVersion)
  const found = pools.find((pool) => pool.planet.planet === toIndexText(planet))
  if (found === undefined) throw new RangeError(`system ${system} holds no planet ${planet}`)
  return found
}

/**
 * The ore mix the planet is generated with: its campaign index's, under its address seed and its
 * ore rules stamp (the stamp a planet entered now takes when none is named).
 */
export function poolMixOf(
  worldSeed: number,
  system: bigint,
  roster: PoolPlanet,
  oreRulesVersion?: number,
): OreMix {
  const planetIndex = planetIndexOfCampaign(readIndexText(roster.campaignIndex) ?? 0n)
  const stamp = oreRulesVersion ?? oreRulesVersionOnEntry(planetIndex)
  return oreMixOf(planetParamsAt(worldSeed, system, planetIndex, stamp))
}

/** The Systems numbers a pool is cut by and the ore rules its planet's cells were drawn under. */
export interface PoolCut {
  rules: MaterialPoolRules
  oreRulesVersion: number | undefined
}

export function poolDraftOf(
  worldSeed: number,
  system: bigint,
  roster: PoolPlanet,
  { rules, oreRulesVersion }: PoolCut,
): PoolDraft {
  const mix = poolMixOf(worldSeed, system, roster, oreRulesVersion)
  const runs = splitRunsOf(paintedRunsOf(mix), rules.kindsTarget)
  const gemTiers = gemSaleTiersByKindOf(runs, rules.gemCount, mix.planetIndex)
  const kinds = kindsOfRuns(poolIdOf(roster.id), runs, gemTiers, newOreFamilyOf(roster.slot))
  return { roster, kinds, gemValueShareBp: gemValueShareBpOf(mix, runSalesOf(runs, kinds)) }
}

export function poolOf(draft: PoolDraft, looks: readonly KindLook[]): MaterialPool {
  const { roster } = draft
  return {
    id: poolIdOf(roster.id),
    planet: roster.id,
    campaignIndex: roster.campaignIndex,
    act: roster.act,
    newFamily: roster.slot,
    kinds: draft.kinds.map((kind, at) => namedKindOf(kind, looks[at])),
    gemValueShareBp: draft.gemValueShareBp,
  }
}

/** The kinds of the runs in run order, each run's kinds numbered within their rarity. */
function kindsOfRuns(
  poolId: string,
  runs: readonly SplitRun[],
  gemTiers: readonly (number | null)[],
  newOreFamily: string | null,
): PoolDraft['kinds'] {
  const placed = runs.flatMap((run) => Array.from({ length: run.kinds }, () => run))
  const carrier = placed.findIndex(isNewOreFamilyCarrier)
  return placed.map((run, at) => {
    const slot = slotOf(placed, at)
    return {
      id: `${poolId}-${slot}`,
      slot,
      family: run.family,
      rarity: rarityTierOf(run.lead).id,
      lead: run.lead,
      window: run.window,
      gemSaleTier: gemTiers[at],
      clusterCells: clusterCellsOf(run.lead),
      newFamily: at === carrier ? newOreFamily : null,
    }
  })
}

/** `<rarity initial><n>`: the kind's place among the kinds of its rarity so far. */
function slotOf(placed: readonly SplitRun[], at: number): string {
  const lead = placed[at].lead
  const place = placed.slice(0, at + 1).filter((run) => run.lead === lead).length
  return `${rarityTierOf(lead).id.charAt(0)}${place}`
}

/**
 * The sale tier of each kind in run order: the `gemCount` rarest kinds (deepest lead first, later
 * runs first among equals) are the gems, the cheapest of them at the planet's first gem tier.
 */
function gemSaleTiersByKindOf(
  runs: readonly SplitRun[],
  gemCount: number,
  planetIndex: number,
): (number | null)[] {
  const leads = runs.flatMap((run) => Array.from({ length: run.kinds }, () => run.lead))
  const gems = leads
    .map((lead, at) => ({ lead, at }))
    .sort((a, b) => b.lead - a.lead || b.at - a.at)
    .slice(0, gemCount)
    .sort((a, b) => a.lead - b.lead || a.at - b.at)
  const saleTiers = gemSaleTiersOfPlanet(planetIndex)
  return leads.map((_, at) => {
    const rank = gems.findIndex((gem) => gem.at === at)
    return rank < 0 ? null : (saleTiers[rank] ?? null)
  })
}

function runSalesOf(runs: readonly SplitRun[], kinds: PoolDraft['kinds']): RunSale[] {
  return runs.map((run) => ({
    family: run.family,
    lead: run.lead,
    kinds: run.kinds,
    gemSaleTiers: kinds
      .filter((kind) => kind.family === run.family && kind.lead === run.lead)
      .flatMap((kind) => (kind.gemSaleTier === null ? [] : [kind.gemSaleTier])),
  }))
}

function namedKindOf(kind: PoolDraft['kinds'][number], look: KindLook): PoolKind {
  const epithet = epithetOf(look)
  return { ...kind, ...look, epithet, name: materialNameOf(epithet, familyNameOf(kind.family)) }
}

/** The look's own words: "Glinting grits" for the pattern `glinting` over the silhouette `grits`. */
function epithetOf(look: KindLook): string {
  return `${look.pattern.charAt(0).toUpperCase()}${look.pattern.slice(1)} ${look.silhouette}`
}

function familyNameOf(familyId: string): string {
  const family = oreFamilies().find((row) => row.id === familyId)
  if (family === undefined) throw new RangeError(`no ore family "${familyId}"`)
  return family.name
}

function isNewOreFamilyCarrier(run: SplitRun): boolean {
  return run.lead === NEW_ORE_FAMILY_LEAD && run.window[0] === SURFACE_BAND
}

function newOreFamilyOf(slot: NewContentFamily | null): string | null {
  return slot?.kind === 'ore_family' ? slot.id : null
}

function clusterCellsOf(lead: number): readonly [number, number] | null {
  return lead >= RARE_CLUSTER_FIRST_LEAD ? [1, RARE_CLUSTER_SIZE_SHARES_PERCENT.length] : null
}

function poolIdOf(id: PlanetId): string {
  return `system${id.system}-p${id.planet}`
}
