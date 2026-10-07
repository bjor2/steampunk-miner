/**
 * Slice panels on the bay screen (ticket 220, TD lock on #176), registered and sealed like
 * `hudPanels`. A panel reads its own slice store and takes no props.
 *
 * - `header`: drawn in the bay header just left of the money counter (the sell burst's
 *   `Lining −X` tag).
 * - `above`: a full-canvas, click-through layer over the bay screen, for presentation that must
 *   cross it (the burst's coins flying to the counter). It draws whether a bay is open or not, so
 *   a flight in progress finishes after undocking.
 *
 * An empty slot draws no markup.
 */
import type { ComponentType } from 'react'
import { defineRegistry, entriesOf } from '../../systems/registries/seal'

export type BayPanelSlot = 'header' | 'above'

export interface BayPanel {
  id: string
  slot: BayPanelSlot
  Panel: ComponentType
}

export const BAY_PANEL_REGISTRY = defineRegistry<BayPanel>('bayPanels')

/** The slot's panels, sorted by id. */
export function bayPanelsOf(slot: BayPanelSlot): readonly BayPanel[] {
  return entriesOf(BAY_PANEL_REGISTRY).filter((panel) => panel.slot === slot)
}
