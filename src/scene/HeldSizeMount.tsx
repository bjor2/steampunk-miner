/**
 * A part on the rig that keeps its own size while the hull root is drawn at the rig's collider
 * width (ticket 913, the G&V row of the #666 lock): it undoes the hull's width scale and rides the
 * body's edge from the code-side `body` anchor (`heldMountXOf`), so the turret and the coal tender
 * stay seated as the body widens. Reads the rig's own width record, never the local presence, and
 * writes its group on a ref each frame, as the width grows step by step; never through React.
 */
import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type { Group } from 'three'
import { heldMountScaleOf, heldMountShiftOf, type RigWidth } from '../systems/render/bodyWidthLook'

interface HeldSizeMountProps {
  /** The rig this part is mounted on: its own collider's width. */
  rig: RigWidth
  /** The part's mount point across the vehicle's frame, m, as authored. */
  mountX: number
  children: ReactNode
}

export function HeldSizeMount({ rig, mountX, children }: HeldSizeMountProps) {
  const group = useRef<Group>(null)
  useFrame(() => {
    if (group.current !== null) holdToSize(group.current, rig, mountX)
  })
  return <group ref={group}>{children}</group>
}

function holdToSize(group: Group, rig: RigWidth, mountX: number): void {
  group.position.x = heldMountShiftOf(mountX, rig)
  group.scale.x = heldMountScaleOf(rig)
}
