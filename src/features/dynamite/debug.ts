/**
 * The dynamite debug read (feature-slices.md 3.14): `getRack` answers what the HUD rack panel
 * draws, so a browser spec asserts the selected size and the plunger's state, never pixels. The
 * plunger itself is pressed through the plant key, as a player presses it.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readRackPanel } from './store/rackPanelReads'

export const dynamiteDebugActions: Readonly<Record<string, DebugAction>> = {
  getRack: () => ({ ok: true, rack: readRackPanel() }),
}
