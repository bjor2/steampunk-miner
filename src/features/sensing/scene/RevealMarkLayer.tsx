/**
 * The sensing reveals in the world (#203, the TD lock on its Q1): every marked cell and buoy pin
 * as a tinted quad of one pooled `InstancedMesh`, one draw call at most `REVEAL_LAYER_BUDGET`
 * instances. It hears the authority's events, advances the slice store once a frame with the
 * authority tick, and rewrites the pool only when the board changed, never through React. It
 * never writes the authority, the camera or the sound.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  type BufferGeometry,
  type Material,
} from 'three'
import { useDisposeEachOnRelease } from '../../../scene/disposeOnRelease'
import { readAuthorityState } from '../../../store/authorityLink'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import type { RevealBoard } from '../systems/revealBoard'
import { REVEAL_LAYER_BUDGET } from '../systems/revealBudget'
import { revealQuadsOf } from '../systems/render/revealLook'
import { useSensingStore } from '../store/sensingStore'
import { showRevealPool } from './revealPresence'

export const REVEAL_LAYER_ID = 'sensing.reveals'

/** Over the collapse cracks (0.27) and under the drill sparks (0.3). */
const REVEAL_Z = 0.28
const REVEAL_OPACITY = 0.45

interface RevealPool {
  mesh: InstancedMesh
  piece: Object3D
  colour: Color
  /** The board the pool shows; another board is written in before the next draw. */
  shown: RevealBoard | null
}

export function RevealMarkLayer() {
  const pool = useMemo(createRevealPool, [])
  useDisposeEachOnRelease(useMemo(() => gpuResourcesOf(pool), [pool]))
  useEffect(() => listenForDomainEvents(useSensingStore.getState().hearSensingEvents), [])
  useEffect(() => showRevealPool(pool), [pool])
  useFrame(() => {
    useSensingStore.getState().advanceSensingTo(readAuthorityState().tick)
    writeBoardInto(pool, useSensingStore.getState().board)
  })
  return <primitive object={pool.mesh} />
}

function createRevealPool(): RevealPool {
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: REVEAL_OPACITY,
    depthWrite: false,
  })
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, REVEAL_LAYER_BUDGET.instances)
  mesh.count = 0
  mesh.frustumCulled = false
  return { mesh, piece: new Object3D(), colour: new Color(), shown: null }
}

/** A `<primitive>` is never disposed by R3F (#118): the pool frees its own. */
function gpuResourcesOf(pool: RevealPool): (BufferGeometry | Material | InstancedMesh)[] {
  return [pool.mesh, pool.mesh.geometry, pool.mesh.material as Material]
}

function writeBoardInto(pool: RevealPool, board: RevealBoard): void {
  if (pool.shown === board) return
  pool.shown = board
  const quads = revealQuadsOf(board).slice(0, REVEAL_LAYER_BUDGET.instances)
  quads.forEach((quad, at) => {
    pool.piece.position.set(quad.x, quad.y, REVEAL_Z)
    pool.piece.rotation.set(0, 0, quad.turn)
    pool.piece.scale.set(quad.size, quad.size, 1)
    pool.piece.updateMatrix()
    pool.mesh.setMatrixAt(at, pool.piece.matrix)
    pool.mesh.setColorAt(at, pool.colour.set(quad.colour))
  })
  pool.mesh.count = quads.length
  pool.mesh.instanceMatrix.needsUpdate = true
  if (pool.mesh.instanceColor !== null) pool.mesh.instanceColor.needsUpdate = true
}
