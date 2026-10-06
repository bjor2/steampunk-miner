/**
 * How slices shape generated ore (docs/standards/feature-slices.md 3.8): every hook is a fold
 * applied in id order, never a single provider, so two slices can stack. Each hook gets its own
 * `subSeedForHook` seed. Hooks are integer-only and a pure function of the params and the chunk,
 * so any chunk order still gives the same planet. With no hook the cells are unchanged.
 */
import type { OrePatch } from '../world/orePatches'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import type { ResourceFamily } from '../world/worldCell'
import { subSeedForHook } from './hookSeed'
import { defineRegistry, entriesOf } from './seal'

export interface PatchContent {
  family: ResourceFamily
  tierOffset: number
}

export interface GenerationHook {
  id: string
  /** Fold over each patch's content, after the lattice rolls it (default: patch.family, band - 1). */
  patchContent?(
    params: PlanetParams,
    patch: OrePatch,
    content: PatchContent,
    seed: number,
  ): PatchContent
  /** Fold over each painted ore cell. */
  oreCell?(params: PlanetParams, tile: TilePoint, cell: number, seed: number): number
  /** Paint after lava pockets, before the dock, starter-vein and cache stamps. */
  paint?(params: PlanetParams, cells: Uint32Array, cx: number, cy: number, seed: number): void
}

export const GENERATION_HOOK_REGISTRY = defineRegistry<GenerationHook>('generationHooks')

export function generationHooks(): readonly GenerationHook[] {
  return entriesOf(GENERATION_HOOK_REGISTRY)
}

/** The patch's content after every `patchContent` hook, in id order. */
export function foldPatchContent(
  params: PlanetParams,
  patch: OrePatch,
  content: PatchContent,
): PatchContent {
  return generationHooks().reduce(
    (folded, hook) =>
      hook.patchContent?.(params, patch, folded, subSeedForHook(params, hook.id)) ?? folded,
    content,
  )
}

/** The ore cell after every `oreCell` hook, in id order. */
export function foldOreCell(params: PlanetParams, tile: TilePoint, cell: number): number {
  return generationHooks().reduce(
    (folded, hook) =>
      hook.oreCell?.(params, tile, folded, subSeedForHook(params, hook.id)) ?? folded,
    cell,
  )
}

/** Every `paint` hook over the chunk's cells, in id order. */
export function paintGenerationHooks(
  params: PlanetParams,
  cells: Uint32Array,
  cx: number,
  cy: number,
): void {
  for (const hook of generationHooks())
    hook.paint?.(params, cells, cx, cy, subSeedForHook(params, hook.id))
}
