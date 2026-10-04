/**
 * A dynamic body locked to the XY plane (no Z drift, no rotation yet) that the vehicle motor
 * drives. 2D here means: orthographic camera, Z translation and X/Y rotation locked.
 */
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from '@react-three/rapier'
import { useRef, type MutableRefObject, type ReactNode } from 'react'
import { VEHICLE_SIZE, VEHICLE_START } from '../constants/scene'
import { driveVehicle } from './vehicleMotor'

interface VehicleBodyProps {
  /** Latest throttle, -1..1; a ref so reading it never re-renders. */
  throttle: MutableRefObject<number>
  children: ReactNode
}

const HALF = VEHICLE_SIZE / 2

export function VehicleBody({ throttle, children }: VehicleBodyProps) {
  const bodyRef = useRef<RapierRigidBody>(null)

  useBeforePhysicsStep(() => {
    if (bodyRef.current) driveVehicle(bodyRef.current, throttle.current)
  })

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      position={[VEHICLE_START[0], VEHICLE_START[1], 0]}
      enabledTranslations={[true, true, false]}
      enabledRotations={[false, false, false]}
    >
      <CuboidCollider args={[HALF, HALF, HALF]} />
      {children}
    </RigidBody>
  )
}
