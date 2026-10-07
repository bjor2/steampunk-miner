/**
 * Slice panels on the HUD (docs/standards/feature-slices.md 3.14): each slot draws its panels right
 * after its kernel component, so a slice adds HUD markup without editing `HudView`. A panel reads
 * its own slice store and takes no props.
 *
 * The `overlay` slot (#208) is the full-screen layer over the canvas, under the rest of the HUD:
 * its panels draw `OverlayCard`s at world points, and each declares the `priority` its cards hold
 * a seat with when more than the cap want to show.
 *
 * The `slots` slot (#217) is the power-up slot column inside the touch controls: drawn after the
 * cluster while the touch controls show, where #200 puts its 56 px slot buttons.
 */
import type { ComponentType } from 'react'
import { defineRegistry, entriesOf } from '../../systems/registries/seal'

export type HudSlot = 'overlay' | 'gauges' | 'banner' | 'position' | 'prompts' | 'threats' | 'slots'

export interface SlotPanel {
  id: string
  slot: Exclude<HudSlot, 'overlay'>
  Panel: ComponentType
}

export interface OverlayPanel {
  id: string
  slot: 'overlay'
  /** A higher priority keeps its cards when the overlay is full. */
  priority: number
  Panel: ComponentType
}

export type HudPanel = SlotPanel | OverlayPanel

export const HUD_PANEL_REGISTRY = defineRegistry<HudPanel>('hudPanels')

/** The slot's panels, sorted by id. */
export function hudPanelsOf(slot: HudSlot): readonly HudPanel[] {
  return entriesOf(HUD_PANEL_REGISTRY).filter((panel) => panel.slot === slot)
}

/** The overlay slot's panels, sorted by id. */
export function overlayPanels(): readonly OverlayPanel[] {
  return entriesOf(HUD_PANEL_REGISTRY).filter(isOverlayPanel)
}

function isOverlayPanel(panel: HudPanel): panel is OverlayPanel {
  return panel.slot === 'overlay'
}
