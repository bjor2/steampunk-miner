/**
 * A mineral skin's layers (#576, GD ruling 20 Oct 2026, ticket 591): a base texture, a vein or
 * crystal shape, a palette and a sheen, drawn in that order, bottom first, each chosen by the
 * species' skin row. Two skins look alike only when they share all four layers, so the combination
 * is what the no-two-alike guard compares. Look only: horizontal, nothing but the look reads it.
 */

/** Draw order, bottom first. */
export const SKIN_LAYER_KINDS = ['base', 'vein', 'palette', 'sheen'] as const

export type SkinLayerKind = (typeof SKIN_LAYER_KINDS)[number]

export interface SkinLayer {
  kind: SkinLayerKind
  id: string
}

/** One layer id per kind: what a skin row chooses, whoever wears it. */
export type SkinLayerIds = Readonly<Record<SkinLayerKind, string>>

/** A species' skin row of `mineralSkins.json`: its species id and one layer id per kind. */
export type SkinRow = { species: string } & SkinLayerIds

/** A planet's signature skin row (ticket 603): the planet whose signature material wears it. */
export type SignatureSkinRow = { planet: number } & SkinLayerIds

export interface MineralSkin {
  speciesId: string
  /** One per kind, in `SKIN_LAYER_KINDS` order. */
  layers: readonly SkinLayer[]
}

/** The skin of a planet's signature material, the slotless 16th material (#453 E1). */
export interface SignatureSkin {
  planetIndex: number
  oreTypeId: string
  /** One per kind, in `SKIN_LAYER_KINDS` order. */
  layers: readonly SkinLayer[]
}

/** A skin and who wears it, in the guards' words: a species id or a planet's signature. */
export interface WornSkin {
  wearer: string
  layers: readonly SkinLayer[]
}

/** The row's layers stacked in draw order. */
export function skinOfRow(row: SkinRow): MineralSkin {
  return { speciesId: row.species, layers: layersOfRow(row) }
}

export function layersOfRow(row: SkinLayerIds): SkinLayer[] {
  return SKIN_LAYER_KINDS.map((kind) => ({ kind, id: row[kind] }))
}

export function wornSpeciesSkinOf(skin: MineralSkin): WornSkin {
  return { wearer: skin.speciesId, layers: skin.layers }
}

export function wornSignatureSkinOf(planetIndex: number, layers: readonly SkinLayer[]): WornSkin {
  return { wearer: `the signature of planet ${planetIndex}`, layers }
}

/** Why some of the skins would read as one material; empty when every combination is its own. */
export function sharedSkinProblems(skins: readonly WornSkin[]): string[] {
  const keys = skins.map(combinationKeyOf)
  return skins
    .filter((_, at) => keys.indexOf(keys[at]) !== at)
    .map(
      (skin) =>
        `${skin.wearer} shares ${combinationTextOf(skin)} with ${skins[keys.indexOf(combinationKeyOf(skin))].wearer}`,
    )
}

function combinationKeyOf(skin: WornSkin): string {
  return skin.layers.map((layer) => layer.id).join('|')
}

function combinationTextOf(skin: WornSkin): string {
  return skin.layers.map((layer) => `${layer.kind} ${layer.id}`).join(', ')
}
