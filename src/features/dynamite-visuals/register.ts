/**
 * The dynamite-visuals slice's registration (#215, the wiring of #145; it replaces the kernel's
 * charge rack and planted charge): the two Blender assets, the rack at its `hull.rear` attach use
 * as a vehicle piece, the planted sizes as a scene layer, and the blast cue that sizes each
 * detonation's shake, flash and thump. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { dynamiteVisualsDebugActions } from './debug'
import { DYNAMITE_RACK_PIECE_ID, DynamiteRackPiece } from './scene/DynamiteRackPiece'
import {
  PLANTED_DYNAMITE_BUDGET,
  PLANTED_DYNAMITE_LAYER_ID,
  PlantedDynamiteLayer,
} from './scene/PlantedDynamiteLayer'
import { DYNAMITE_BLAST_CUE } from './systems/render/blastCueProvider'
import { dynamiteArtAssets } from './systems/render/dynamiteArt'
import { RACK_ATTACH_USE } from './systems/render/rackLook'

export const slice: SliceDefinition = {
  id: 'dynamite-visuals',
  register(r) {
    // The rack and the planted prop, under public/assets/vehicle/ and public/assets/prop/ (#214).
    r.artAssets(dynamiteArtAssets())
    r.attachUse(RACK_ATTACH_USE)
    r.vehiclePiece({ id: DYNAMITE_RACK_PIECE_ID, Piece: DynamiteRackPiece })
    r.sceneLayer({
      id: PLANTED_DYNAMITE_LAYER_ID,
      Layer: PlantedDynamiteLayer,
      budget: PLANTED_DYNAMITE_BUDGET,
    })
    r.chargeBlastCue(DYNAMITE_BLAST_CUE)
    // steampunkDebug.features['dynamite-visuals'].getRack()
    r.debugActions(dynamiteVisualsDebugActions)
  },
}
