/**
 * The dynamite-visuals debug read (feature-slices.md 3.14): `getRack` answers which rack parts the
 * car shows now (frame, a stick per open size, the wire reel once the plunger is), from the same
 * rule the rack piece draws, so a browser spec asserts the swap without reading pixels.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readRackPartIds } from './store/rackSightReads'

export const dynamiteVisualsDebugActions: Readonly<Record<string, DebugAction>> = {
  getRack: () => ({ ok: true, partIds: readRackPartIds() }),
}
