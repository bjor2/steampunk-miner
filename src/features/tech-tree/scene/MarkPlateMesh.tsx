/**
 * The brass Mark plate under a cradle (#161 Systems, ticket 250): a plate, a gilded rim once the
 * item is Mastered, and one rivet per Mark from `markPlatesOf`. Not a Blender asset: three flat
 * shapes lit like the placeholders (#48 lit brass), the rivets one instanced draw.
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type InstancedMesh } from 'three'
import type { MarkPlate } from '../systems/render/markPlate'

/** Over the cradle housing's draw order (6) on the body's layer (0.1, 0.01 an order step). */
const PLATE_Z = 0.165
const RIVET_Z = 0.001
const RIM_Z = -0.001
/** A darker brass than the gilt rim, which is the kit's `--color-brass`, the tree's Mastered chip. */
const BRASS = '#9a7432'
const GILT = '#c9a24b'
const RIVET_COLOUR = '#5a4320'
const RIM_M = 0.012
const RIVET_RADIUS_M = 0.005
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
      <Rivets rivets={plate.rivets} />
    </group>
  )
}

function GiltRim({ width, height }: { width: number; height: number }) {
  return (
    <mesh position={[0, 0, RIM_Z]}>
      <planeGeometry args={[width + RIM_M, height + RIM_M]} />
      <meshStandardMaterial color={GILT} roughness={PLATE_ROUGHNESS} />
    </mesh>
  )
}

function Rivets({ rivets }: { rivets: MarkPlate['rivets'] }) {
  const mesh = useRef<InstancedMesh>(null)
  const piece = useMemo(() => new Object3D(), [])
  useLayoutEffect(() => placeRivets(mesh.current, piece, rivets), [piece, rivets])
  return (
    // A new Mark is a new count: keyed on it, the mesh is rebuilt with room for every rivet.
    <instancedMesh
      key={rivets.length}
      ref={mesh}
      args={[undefined, undefined, rivets.length]}
      frustumCulled={false}
    >
      <circleGeometry args={[RIVET_RADIUS_M, RIVET_SEGMENTS]} />
      <meshStandardMaterial color={RIVET_COLOUR} roughness={PLATE_ROUGHNESS} />
    </instancedMesh>
  )
}

function placeRivets(mesh: InstancedMesh | null, piece: Object3D, rivets: MarkPlate['rivets']) {
  if (mesh === null) return
  rivets.forEach(([x, y], at) => {
    piece.position.set(x, y, RIVET_Z)
    piece.updateMatrix()
    mesh.setMatrixAt(at, piece.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
}
