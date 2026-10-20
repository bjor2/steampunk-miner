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

/** A species' skin row of `mineralSkins.json`: its species id and one layer id per kind. */
export type SkinRow = { species: string } & Readonly<Record<SkinLayerKind, string>>

export interface MineralSkin {
  speciesId: string
  /** One per kind, in `SKIN_LAYER_KINDS` order. */
  layers: readonly SkinLayer[]
}

/** The row's layers stacked in draw order. */
export function skinOfRow(row: SkinRow): MineralSkin {
  return {
    speciesId: row.species,
    layers: SKIN_LAYER_KINDS.map((kind) => ({ kind, id: row[kind] })),
  }
}

/** Why some of the skins would read as one species; empty when every combination is its own. */
export function sharedSkinProblems(skins: readonly MineralSkin[]): string[] {
  const keys = skins.map(combinationKeyOf)
  return skins
    .filter((_, at) => keys.indexOf(keys[at]) !== at)
    .map(
      (skin) =>
        `${skin.speciesId} shares ${combinationTextOf(skin)} with ${skins[keys.indexOf(combinationKeyOf(skin))].speciesId}`,
    )
}

function combinationKeyOf(skin: MineralSkin): string {
  return skin.layers.map((layer) => layer.id).join('|')
}

function combinationTextOf(skin: MineralSkin): string {
  return skin.layers.map((layer) => `${layer.kind} ${layer.id}`).join(', ')
}
