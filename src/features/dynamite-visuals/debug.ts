/**
 * The dynamite-visuals debug reads (feature-slices.md 3.14), so a browser spec asserts the looks
 * without reading pixels: `getRack` answers which rack parts the car shows now (frame, a stick per
 * open size, the wire reel once the plunger is), from the same rule the rack piece draws;
 * `getFront` answers the slices the blast front layer has thrown and the most it drew in a frame,
 * beside the budget it declares (#213); `getMarks` the craters, rings and sparks the marks layer
 * holds and its peak (D7, ticket 866), with the blasts, showcases and falls the front played and
 * the showcase banner shown now (D8, ticket 868). `previewBlast(size, variant?)` plays a size's
 * solid-rock blast at the vehicle through the real layer, `'showcase'` as the size's first blast
 * after a purchase, presentation only: no command and no log line, as the example slice's test
 * piece (3.18).
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { chargeSizeCount, isChargeSize } from '../../systems/economy/chargeSizes'
import { blastFrontPresence } from './scene/blastFrontPresence'
import { BLAST_MARKS_BUDGET } from './scene/BlastMarksLayer'
import { blastMarksPresence } from './scene/blastMarksPresence'
import { BLAST_FRONT_BUDGET } from './scene/blastFrontPools'
import { previewBlastAtVehicle } from './store/blastFeed'
import { readShowcaseBanner } from './store/showcaseBanner'
import { isPreviewVariant } from './systems/render/blastPreview'
import { readRackPartIds } from './store/rackSightReads'

export const dynamiteVisualsDebugActions: Readonly<Record<string, DebugAction>> = {
  getRack: () => ({ ok: true, partIds: readRackPartIds() }),
  getFront: () => ({
    ok: true,
    frontsThrown: blastFrontPresence.frontsThrown,
    flashesLit: blastFrontPresence.flashesLit,
    blastsPlayed: blastFrontPresence.blastsPlayed,
    showcasesPlayed: blastFrontPresence.showcasesPlayed,
    fallsPlayed: blastFrontPresence.fallsPlayed,
    banner: readShowcaseBanner(),
    peak: { ...blastFrontPresence.peak },
    budget: BLAST_FRONT_BUDGET,
  }),
  getMarks: () => ({
    ok: true,
    craters: blastMarksPresence.craters,
    decals: blastMarksPresence.decals,
    rings: blastMarksPresence.rings,
    sparks: blastMarksPresence.sparks,
    peak: { ...blastMarksPresence.peak },
    budget: BLAST_MARKS_BUDGET,
  }),
  previewBlast: (size, variant) => previewBlastOfSize(size, variant),
}

function previewBlastOfSize(size: unknown, variant: unknown): DebugResult {
  if (typeof size !== 'number' || !isChargeSize(size)) {
    return { ok: false, problems: [`size must be 1 to ${chargeSizeCount()}, got ${String(size)}`] }
  }
  if (variant !== undefined && !isPreviewVariant(variant)) {
    return { ok: false, problems: [`variant must be plain or showcase, got ${String(variant)}`] }
  }
  previewBlastAtVehicle(size, variant)
  return { ok: true }
}
