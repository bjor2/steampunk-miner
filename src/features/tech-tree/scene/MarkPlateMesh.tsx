/**
 * The brass Mark plate under a cradle (#161 Systems, ticket 250): a plate, a gilded rim once the
 * item is Mastered, one rivet per Mark and a gilt stud over each reached milestone's rivet (ticket
 * 277) from `markPlatesOf`. Not a Blender asset: flat shapes lit like the placeholders (#48 lit
 * brass), the rivets one instanced draw and the studs another.
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type InstancedMesh } from 'three'
import { GILT_COLOUR, type MarkPlate } from '../systems/render/markPlate'

/** Over the cradle housing's draw order (6) on the body's layer (0.1, 0.01 an order step). */
const PLATE_Z = 0.165
const RIVET_Z = 0.001
/** One order step over the rivets it covers. */
const STUD_Z = 2 * RIVET_Z
const RIM_Z = -0.001
/** A darker brass than the gilt rim and studs. */
const BRASS = '#9a7432'
const RIVET_COLOUR = '#5a4320'
const RIM_M = 0.012
const RIVET_RADIUS_M = 0.005
/** A stud covers its rivet and most of the pitch between rivets, so a milestone reads at a glance. */
const STUD_RADIUS_M = 0.008
const PLATE_ROUGHNESS = 0.45
const RIVET_SEGMENTS = 8

export function MarkPlateMesh({ plate }: { plate: MarkPlate }) {
  const [width, height] = plate.size
  return (
    <group position={[plate.centre[0], plate.centre[1], PLATE_Z]}>
      {plate.isGilded && <GiltRim width={width} height={height} />}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={BRASS} roughness={PLATE_ROUGHNESS} />
      </mesh>
      <Dots at={plate.rivets} radius={RIVET_RADIUS_M} colour={RIVET_COLOUR} z={RIVET_Z} />
      <Dots at={plate.studs} radius={STUD_RADIUS_M} colour={GILT_COLOUR} z={STUD_Z} />
    </group>
  )
}

function GiltRim({ width, height }: { width: number; height: number }) {
  return (
    <mesh position={[0, 0, RIM_Z]}>
      <planeGeometry args={[width + RIM_M, height + RIM_M]} />
      <meshStandardMaterial color={GILT_COLOUR} roughness={PLATE_ROUGHNESS} />
    </mesh>
  )
}

interface DotsProps {
  at: MarkPlate['rivets']
  radius: number
  colour: string
  z: number
}

/** The rivets, or the studs: one instanced draw of flat discs. Nothing with none to draw. */
function Dots({ at, radius, colour, z }: DotsProps) {
  const mesh = useRef<InstancedMesh>(null)
  const piece = useMemo(() => new Object3D(), [])
  useLayoutEffect(() => placeDots(mesh.current, piece, at, z), [piece, at, z])
  if (at.length === 0) return null
  return (
    // A new Mark is a new count: keyed on it, the mesh is rebuilt with room for every disc.
    <instancedMesh
      key={at.length}
      ref={mesh}
      args={[undefined, undefined, at.length]}
      frustumCulled={false}
    >
      <circleGeometry args={[radius, RIVET_SEGMENTS]} />
      <meshStandardMaterial color={colour} roughness={PLATE_ROUGHNESS} />
    </instancedMesh>
  )
}

function placeDots(
  mesh: InstancedMesh | null,
  piece: Object3D,
  at: MarkPlate['rivets'],
  z: number,
) {
  if (mesh === null) return
  at.forEach(([x, y], index) => {
    piece.position.set(x, y, z)
    piece.updateMatrix()
    mesh.setMatrixAt(index, piece.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
}
