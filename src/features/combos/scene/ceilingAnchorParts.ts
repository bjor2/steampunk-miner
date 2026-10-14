/**
 * The ceiling anchor on the drawn car (ticket 288; GD ruling Q2-Q4 on #288): the kernel's part
 * motion presence asks this once per fixed step, after the step's authority tick. It steps the
 * tilt from the replica (`anchorTilt.ts`) and answers it as a pose on the drill head's plate and
 * bit; on the step the anchor lets go mid up-cut it asks the kernel for the light clank. The part
 * motion source is the only per-step client hook a slice has, and the clank must land on that exact
 * tick, so it is asked from here. One kept request, so a step allocates nothing. The grav anchor's
 * own part needs nothing: up-cuts are allowed only while the anchor clings, so it is engaged then.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { requestOneShot } from '../../../store/oneShotRequests'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type {
  PartMotionRequest,
  PartMotionRequestSource,
  PartPoseRequest,
} from '../../../systems/registries/partMotionRequests'
import {
  ANCHOR_DROP_CLANK,
  isClinging,
  isUpCutCellStanding,
  upCutSideOf,
} from '../systems/ceilingAnchor'
import {
  createAnchorReading,
  createAnchorTilt,
  stepAnchorTilt,
  tiltAngleOf,
  type AnchorReading,
  type AnchorTilt,
} from '../systems/render/anchorTilt'

const NO_REQUESTS: readonly PartMotionRequest[] = []

export interface CeilingAnchorParts {
  /** The step's requests for `playerId`'s car, clanking on the step the anchor lets go mid-cut. */
  requestsAt(state: AuthorityState, playerId: string): readonly PartMotionRequest[]
}

export function createCeilingAnchorParts(): CeilingAnchorParts {
  const look = createAnchorTilt()
  const reading = createAnchorReading()
  const pose: PartPoseRequest = {
    kind: 'pose',
    attach: 'drill.head',
    slots: ['drill-head', 'drill-bit'],
    x: 0,
    y: 0,
    angle: 0,
    glow: 0,
  }
  const tilted: readonly PartMotionRequest[] = [pose]
  return {
    requestsAt(state, playerId) {
      readAnchorInto(reading, state, playerId)
      if (stepAnchorTilt(look, reading)) requestOneShot(ANCHOR_DROP_CLANK.id)
      return tiltRequestsOf(look, pose, tilted)
    },
  }
}

const localParts = createCeilingAnchorParts()

export const CEILING_ANCHOR_PARTS: PartMotionRequestSource = {
  id: 'combos.ceiling_anchor',
  requestsNow: () => localParts.requestsAt(readAuthorityState(), useGameStore.getState().playerId),
}

function readAnchorInto(reading: AnchorReading, state: AuthorityState, playerId: string): void {
  reading.tick = state.tick
  reading.isClinging = isClinging(state, playerId)
  reading.upCutSide = upCutSideOf(state, playerId)
  reading.isUpCutCellStanding = isUpCutCellStanding(state, playerId)
}

function tiltRequestsOf(
  look: AnchorTilt,
  pose: PartPoseRequest,
  tilted: readonly PartMotionRequest[],
): readonly PartMotionRequest[] {
  if (look.tilt === 0) return NO_REQUESTS
  pose.angle = tiltAngleOf(look)
  return tilted
}
