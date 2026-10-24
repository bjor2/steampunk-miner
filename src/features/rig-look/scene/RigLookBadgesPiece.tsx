/**
 * The finish badges on the car (ticket 809): a vehicle piece (#235) that draws, for each line past
 * its authored art, a small plate in the band's finish at the line's attach point with its rank
 * pips (`rigLookBadges.ts`), so a band with no art yet never renders invisible. It changes only
 * when a band, a pip count or the rig's tier does, so it renders through React; above the body's
 * parts, and named apart from every part slot, so no glow or swap of the vehicle look reaches it.
 */
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { useGameStore } from '../../../store/gameStore'
import {
  MARK_EDGE_SCALE,
  pipMarkQuadOf,
  type PipMark,
  type RigLookBadge,
} from '../systems/render/rigLookBadges'
import { readRigLookBadgeKey, readRigLookBadgesFor } from '../store/rigLookBadgeReads'

export const RIG_LOOK_BADGES_PIECE_ID = 'rig-look.badges'

/** Above the body's parts (0.1 plus their draw orders) and below the HUD's world markers. */
const BADGE_Z = 0.45
/** The marks sit a hair above their plate. */
const MARK_LIFT = 0.002
/** Pale marks on a dark edge, readable on every finish from black oxide to polished chrome. */
const MARK_COLOUR = '#f4ead2'
const MARK_EDGE_COLOUR = '#1b1611'

export function RigLookBadgesPiece() {
  const badges = readRigLookBadgesFor(useGameStore(readRigLookBadgeKey), SHIPPED_ART)
  return (
    <>
      {badges.map((badge) => (
        <BadgeMesh key={badge.line} badge={badge} />
      ))}
    </>
  )
}

function BadgeMesh({ badge }: { badge: RigLookBadge }) {
  const { plate } = badge
  return (
    <group name={`rig-look-badge-${badge.line}`} position={[0, 0, BADGE_Z]}>
      <mesh position={[plate.x, plate.y, 0]}>
        <planeGeometry args={[plate.width, plate.height]} />
        <meshStandardMaterial
          color={badge.finishColour}
          metalness={badge.metalness}
          roughness={badge.roughness}
        />
      </mesh>
      {badge.marks.map((mark, at) => (
        <PipMesh key={at} mark={mark} />
      ))}
    </group>
  )
}

function PipMesh({ mark }: { mark: PipMark }) {
  const { width, height, angle } = pipMarkQuadOf(mark)
  return (
    <group position={[mark.x, mark.y, MARK_LIFT]} rotation={[0, 0, angle]}>
      <mesh>
        <planeGeometry args={[width * MARK_EDGE_SCALE, height * MARK_EDGE_SCALE]} />
        <meshBasicMaterial color={MARK_EDGE_COLOUR} />
      </mesh>
      <mesh position={[0, 0, MARK_LIFT]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={MARK_COLOUR} />
      </mesh>
    </group>
  )
}
