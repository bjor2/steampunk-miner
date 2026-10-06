/**
 * Slice panels on the HUD (docs/standards/feature-slices.md 3.14): each slot draws its panels right
 * after its kernel component, so a slice adds HUD markup without editing `HudView`. A panel reads
 * its own slice store and takes no props.
 */
import type { ComponentType } from 'react'
import { defineRegistry, entriesOf } from '../../systems/registries/seal'

export type HudSlot = 'gauges' | 'banner' | 'position' | 'prompts' | 'threats'

export interface HudPanel {
  id: string
  slot: HudSlot
  Panel: ComponentType
}

export const HUD_PANEL_REGISTRY = defineRegistry<HudPanel>('hudPanels')

/** The slot's panels, sorted by id. */
export function hudPanelsOf(slot: HudSlot): readonly HudPanel[] {
  return entriesOf(HUD_PANEL_REGISTRY).filter((panel) => panel.slot === slot)
}
