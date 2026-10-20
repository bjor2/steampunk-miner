/**
 * The mineral skins table (#576, GD ruling 20 Oct 2026, ticket 591): read once from
 * `mineralSkins.json` and refused whole when broken, every problem listed. A skin row names a
 * species of the materials table and one id of each layer list; a species wears at most one skin,
 * and no two species of one pool share all four layers. A planet's species are its pool's
 * (ticket 542), so the pool guard keeps any two species of one planet apart. A palette's body is
 * the hue slot colour of every species wearing it (ticket 592). An empty table loads, so the batch
 * tickets land rows one planet at a time.
 */
import type { Rgb } from '../../../systems/render/colour'
import { hueSlotColourOf, MATERIALS, type MaterialTable } from '../../materials'
import mineralSkinsFile from '../mineralSkins.json'
import { rampBodyProblems, type PaletteRamp } from './paletteRamps'
import {
  SKIN_LAYER_KINDS,
  sharedSkinProblems,
  skinOfRow,
  type SkinLayerKind,
  type SkinRow,
} from './skinLayers'
import { layerEntryShapeProblems, skinRowShapeProblems } from './skinRowShape'

export interface SkinTable {
  /** Each kind's layer ids, sorted. */
  layers: Readonly<Record<SkinLayerKind, readonly string[]>>
  /** Sorted by species id. */
  skins: readonly SkinRow[]
  /** Each palette id's ramp. */
  ramps: ReadonlyMap<string, PaletteRamp>
}

/** What the guards measure skins against: each species' pool and hue slot colour. */
export interface SkinGuardContext {
  poolBySpecies: ReadonlyMap<string, string>
  hueColourBySpecies: ReadonlyMap<string, Rgb>
}

type Raw = Record<string, unknown>

export function skinGuardContext(materials: MaterialTable = MATERIALS): SkinGuardContext {
  return {
    poolBySpecies: new Map(materials.materials.map((material) => [material.id, material.pool])),
    hueColourBySpecies: hueColourBySpeciesOf(materials),
  }
}

export const MINERAL_SKINS: SkinTable = loadSkinTable(mineralSkinsFile, skinGuardContext())

/** Why a file is not a skins table; empty when it may ship. */
export function skinTableProblems(raw: unknown, context: SkinGuardContext): string[] {
  const file = (raw ?? {}) as Raw
  if (!hasListsOfTable(file)) {
    return [`skins and layers.${SKIN_LAYER_KINDS.join(', layers.')} must be lists`]
  }
  const shapeProblems = fileShapeProblems(file)
  if (shapeProblems.length > 0) return shapeProblems
  return crossRowProblems(tableOf(file), context)
}

export function loadSkinTable(raw: unknown, context: SkinGuardContext): SkinTable {
  const problems = skinTableProblems(raw, context)
  if (problems.length > 0) throw new Error(`mineralSkins.json is refused:\n${problems.join('\n')}`)
  return tableOf(raw as Raw)
}

/** The materials loader refuses a row naming an unknown hue slot, so every species has its colour. */
function hueColourBySpeciesOf(materials: MaterialTable): Map<string, Rgb> {
  const slots = new Map(materials.hueSlots.map((slot) => [slot.id, slot]))
  return new Map(
    materials.materials.flatMap((material) => {
      const slot = slots.get(material.hueSlot)
      return slot === undefined ? [] : [[material.id, hueSlotColourOf(slot)] as const]
    }),
  )
}

function hasListsOfTable(file: Raw): boolean {
  const layers = (file.layers ?? {}) as Raw
  return Array.isArray(file.skins) && SKIN_LAYER_KINDS.every((kind) => Array.isArray(layers[kind]))
}

function fileShapeProblems(file: Raw): string[] {
  const layers = file.layers as Record<SkinLayerKind, Raw[]>
  return [
    ...SKIN_LAYER_KINDS.flatMap((kind) => layerListProblems(layers[kind], kind)),
    ...(file.skins as Raw[]).flatMap((row, at) => skinRowShapeProblems(row, `skins[${at}]`)),
  ]
}

function crossRowProblems(table: SkinTable, context: SkinGuardContext): string[] {
  return [
    ...unknownSpeciesProblems(table.skins, context),
    ...twoSkinProblems(table.skins),
    ...unknownLayerProblems(table),
    ...poolsOf(context).flatMap((pool) => sharedSkinProblemsOfPool(table.skins, pool, context)),
    ...rampBodyProblems(table.skins, table.ramps, context.hueColourBySpecies),
  ]
}

function layerListProblems(entries: readonly Raw[], kind: SkinLayerKind): string[] {
  const ids = entries.map((entry) => entry.id)
  return [
    ...entries.flatMap((entry, at) =>
      layerEntryShapeProblems(entry, kind, `layers.${kind}[${at}]`),
    ),
    ...ids
      .filter((id, at) => ids.indexOf(id) !== at)
      .map((id) => `layers.${kind} lists ${String(id)} twice`),
  ]
}

function unknownSpeciesProblems(skins: readonly SkinRow[], context: SkinGuardContext): string[] {
  return skins
    .filter((skin) => !context.poolBySpecies.has(skin.species))
    .map((skin) => `a skin names ${skin.species}, which is no species of the materials table`)
}

function twoSkinProblems(skins: readonly SkinRow[]): string[] {
  const species = skins.map((skin) => skin.species)
  return species
    .filter((id, at) => species.indexOf(id) !== at)
    .map((id) => `${id} wears two skins; a species has one`)
}

function unknownLayerProblems(table: SkinTable): string[] {
  return table.skins.flatMap((skin) =>
    SKIN_LAYER_KINDS.filter((kind) => !table.layers[kind].includes(skin[kind])).map(
      (kind) => `${skin.species} names the ${kind} ${skin[kind]}, which layers.${kind} lacks`,
    ),
  )
}

/** Within a pool, since a planet's species are its pool's (ticket 542). */
function sharedSkinProblemsOfPool(
  skins: readonly SkinRow[],
  pool: string,
  context: SkinGuardContext,
): string[] {
  const ofPool = skins.filter((skin) => context.poolBySpecies.get(skin.species) === pool)
  return sharedSkinProblems(ofPool.map(skinOfRow)).map((problem) => `${problem} in pool ${pool}`)
}

function poolsOf(context: SkinGuardContext): string[] {
  return [...new Set(context.poolBySpecies.values())].sort()
}

function tableOf(file: Raw): SkinTable {
  const layers = file.layers as Record<SkinLayerKind, { id: string }[]>
  const palettes = layers.palette as { id: string; ramp: PaletteRamp }[]
  return {
    layers: Object.fromEntries(
      SKIN_LAYER_KINDS.map((kind) => [kind, layers[kind].map((entry) => entry.id).sort()]),
    ) as Record<SkinLayerKind, string[]>,
    skins: (file.skins as SkinRow[]).map((row) => ({ ...row })).sort(bySpecies),
    ramps: new Map(palettes.map((palette) => [palette.id, palette.ramp])),
  }
}

/** Code-unit order, as the kernel registries sort, so every machine lists the same skins. */
function bySpecies(a: SkinRow, b: SkinRow): number {
  if (a.species === b.species) return 0
  return a.species < b.species ? -1 : 1
}
