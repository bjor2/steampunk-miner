/**
 * The drill head drawn at the facing the controller's head points at (#7): it sits on the side
 * of the body it faces, in the body's own frame, so it turns with the body's upright frame and
 * never rotates the body. Updated on a ref each frame; the head never goes through React state.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'
import { DRILL_HEAD_COLOUR, DRILL_HEAD_SIZE } from '../constants/scene'
import { VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import type { VehicleController } from '../physics/vehicleController'
import { settledFacingOf } from '../systems/vehicle/drillHead'
import { FACING, type Facing } from '../systems/vehicle/vehiclePose'

const OFFSET = (VEHICLE_COLLIDER_SIZE + DRILL_HEAD_SIZE) / 2
/** In front of the placeholder's layers. */
const HEAD_Z = 0.2

const OFFSET_BY_FACING: Readonly<Record<Facing, readonly [number, number]>> = {
  [FACING.left]: [-OFFSET, 0],
  [FACING.right]: [OFFSET, 0],
  [FACING.down]: [0, -OFFSET],
  [FACING.up]: [0, OFFSET],
}

export function DrillHeadView({ controller }: { controller: VehicleController }) {
  const head = useRef<Mesh>(null)
  useFrame(() => {
    const [x, y] = OFFSET_BY_FACING[settledFacingOf(controller.drillHead())]
    head.current?.position.set(x, y, HEAD_Z)
  })
  return (
    <mesh ref={head}>
      <planeGeometry args={[DRILL_HEAD_SIZE, DRILL_HEAD_SIZE]} />
      <meshBasicMaterial color={DRILL_HEAD_COLOUR} />
    </mesh>
  )
}
