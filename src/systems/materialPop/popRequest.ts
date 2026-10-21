/**
 * A thinned find as the spray pool takes it (ticket 616): its start held behind the nose in the
 * rig's frame, its side, colour and glint from the rarity ladder, its flight time from its side.
 * A special block or an artefact shows at the cap and glints, its own style (HS condition 2), and
 * like a rare-or-better pop it is guarded. Written into one reused request: a pop allocates
 * nothing. Tile size is one metre, so a side in cells is a side in metres.
 */
import { POP_SIZE_CAP_CELLS } from '../../constants/materialPop'
import type { PopRequest } from '../render/popPieces'
import type { PopFind } from './popFinds'
import { popStartOf, type RigFrame } from './popFlight'
import {
  isPopGlinting,
  popColourOf,
  popFlightSecondsOf,
  popSizeCellsOf,
  type PopLadder,
} from './popLook'

export function createPopRequest(): PopRequest {
  return {
    start: { along: 0, upward: 0 },
    sizeM: 0,
    colour: 0,
    isGlinting: false,
    lifeSeconds: 0,
    serial: 0,
    isGuarded: false,
  }
}

export function writePopRequest(
  find: PopFind,
  rig: RigFrame,
  ladder: PopLadder,
  serial: number,
  out: PopRequest,
): PopRequest {
  const isSpecial = find.lane === 'special'
  popStartOf(find.tx, find.ty, rig, out.start)
  out.sizeM = isSpecial ? POP_SIZE_CAP_CELLS : popSizeCellsOf(find.step)
  out.colour = popColourOf(find.lane, find.step, ladder)
  out.isGlinting = isSpecial || isPopGlinting(find.step, ladder.topStep)
  out.lifeSeconds = popFlightSecondsOf(out.sizeM)
  out.serial = serial
  out.isGuarded = find.lane !== 'common'
  return out
}
