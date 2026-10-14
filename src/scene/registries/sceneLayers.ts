/**
 * Slice layers of the world scene (#213, from the TD's #145 seam lock, after the HUD panels of
 * feature-slices.md 3.14): `GameScene` draws every registered layer, sorted by id, after the
 * blast scorches and before the sound stage, so a slice adds blast effects and other world
 * visuals without editing the scene (the planted charges are a layer since #215). With none
 * registered the scene draws no slice layer.
 *
 * A `Layer` takes no props. It reads domain events (`listenForDomainEvents`), the kernel's
 * read-only store reads (`src/store/*Reads`) and its own slice store; it places objects from fixed
 * pools in `useFrame`, never through React per frame, and never writes the authority state, the
 * camera or the sound. Each layer declares the most it draws, so the kernel can hold the sum of
 * them, with the kernel's own always-on spray layer (ticket 348), to `SCENE_LAYER_LINE`.
 */
import type { ComponentType } from 'react'
import { SCENE_LAYER_LINE } from '../../constants/scene'
import { SPRAY_LAYER_BUDGET } from '../../constants/spray'
import { defineRegistry, entriesOf } from '../../systems/registries/seal'

/** The most a layer draws in one frame. */
export interface SceneLayerBudget {
  /** Draw calls; a pooled `InstancedMesh` or `Points` is one, however many it places (#154). */
  drawCalls: number
  /** Objects placed: the capacities of its pools together. */
  instances: number
}

export interface SceneLayer {
  id: string
  Layer: ComponentType
  budget: SceneLayerBudget
}

/**
 * What the kernel draws inside the line whatever slices load: the spray layer, which took
 * dynamite-visuals' debris pool at the same count (ticket 348), so the line's total stayed.
 */
export const KERNEL_SCENE_LAYER_BUDGET: SceneLayerBudget = SPRAY_LAYER_BUDGET

export const SCENE_LAYER_REGISTRY = defineRegistry<SceneLayer>('sceneLayers')

/** Every registered layer, sorted by id. */
export function sceneLayers(): readonly SceneLayer[] {
  return entriesOf(SCENE_LAYER_REGISTRY)
}

/** What the layers draw at most, all together. */
export function sceneLayersBudget(layers: readonly SceneLayer[]): SceneLayerBudget {
  return layers.map(({ budget }) => budget).reduce(addBudgets, { drawCalls: 0, instances: 0 })
}

/** What the line holds: the kernel's spray layer and the given slice layers (#213, ticket 348). */
export function sceneLayerLineUseOf(layers: readonly SceneLayer[]): SceneLayerBudget {
  return addBudgets(KERNEL_SCENE_LAYER_BUDGET, sceneLayersBudget(layers))
}

/** Whether the layers and the kernel's stay within the scene-layer draw envelope (#213). */
export function isWithinSceneLayerLine(layers: readonly SceneLayer[]): boolean {
  const total = sceneLayerLineUseOf(layers)
  return (
    total.drawCalls <= SCENE_LAYER_LINE.drawCalls && total.instances <= SCENE_LAYER_LINE.instances
  )
}

function addBudgets(total: SceneLayerBudget, budget: SceneLayerBudget): SceneLayerBudget {
  return {
    drawCalls: total.drawCalls + budget.drawCalls,
    instances: total.instances + budget.instances,
  }
}
