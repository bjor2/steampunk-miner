/**
 * The dynamite-visuals debug reads (feature-slices.md 3.14), so a browser spec asserts the looks
 * without reading pixels: `getRack` answers which rack parts the car shows now (frame, a stick per
 * open size, the wire reel once the plunger is), from the same rule the rack piece draws;
 * `getFront` answers the slices the blast front layer has thrown and the most it drew in a frame,
 * beside the budget it declares (#213). `previewBlast(size)` plays a size's solid-rock blast at
 * the vehicle through the real layer, presentation only: no command and no log line, as the
 * example slice's test piece (3.18).
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { chargeSizeCount, isChargeSize } from '../../systems/economy/chargeSizes'
import { blastFrontPresence } from './scene/blastFrontPresence'
import { BLAST_FRONT_BUDGET } from './scene/blastFrontPools'
import { previewBlastAtVehicle } from './store/blastFeed'
import { readRackPartIds } from './store/rackSightReads'

export const dynamiteVisualsDebugActions: Readonly<Record<string, DebugAction>> = {
  getRack: () => ({ ok: true, partIds: readRackPartIds() }),
  getFront: () => ({
    ok: true,
    frontsThrown: blastFrontPresence.frontsThrown,
    flashesLit: blastFrontPresence.flashesLit,
    peak: { ...blastFrontPresence.peak },
    budget: BLAST_FRONT_BUDGET,
  }),
  previewBlast: (size) => previewBlastOfSize(size),
}

function previewBlastOfSize(size: unknown): DebugResult {
  if (typeof size !== 'number' || !isChargeSize(size)) {
    return { ok: false, problems: [`size must be 1 to ${chargeSizeCount()}, got ${String(size)}`] }
  }
  previewBlastAtVehicle(size)
  return { ok: true }
}
