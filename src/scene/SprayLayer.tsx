/**
 * The kernel spray layer (ticket 348, the TD kernel lock and GD ruling on #314): one fixed pool of
 * sparks, dust and debris thrown by `requestSpray`, drawn whatever slices are loaded and whatever
 * is unlocked, so the bore gun's P1 tracer never waits on a P7 slice. dynamite-visuals' blast
 * debris moved here at the same count (`SPRAY_CAPACITY`); the slice keeps its ring and flash.
 * One `InstancedMesh`, one draw call, coloured per piece by kind. Presentation only, on the render
 * delta with its own seed; the pool is render-local (ticket 339, `localParticles`), drawn outside
 * the world root. It declares `SPRAY_LAYER_BUDGET` against `SCENE_LAYER_LINE` (#213).
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry } from 'three'
import { SPRAY_CAPACITY, SPRAY_LOOKS } from '../constants/spray'
import {
  createSprayPool,
  pieceSizeAt,
  pieceTurnAt,
  SPRAY_KINDS,
  stepSprayPool,
  type SprayPool,
} from '../systems/render/sprayPool'
import { useDisposeEachOnRelease } from './disposeOnRelease'
import { createPoolOrigin, followRenderOrigin } from './localParticles'
import { admitRequestedSprays } from './sprayIntake'
import { sprayPresence } from './sprayPresence'

/** Where the blast debris drew (#215): over the drill sparks and the blast's fire and dust. */
const SPRAY_Z = 0.32

/** One colour per kind, in `SPRAY_KINDS` order, built once. */
const KIND_COLOURS = SPRAY_KINDS.map((kind) => new Color(SPRAY_LOOKS[kind].colour))

export function SprayLayer() {
  const pool = useMemo(() => createSprayPool(), [])
  const poolOrigin = useMemo(createPoolOrigin, [])
  const mesh = useMemo(createSprayMesh, [])
  const piece = useMemo(() => new Object3D(), [])
  useDisposeEachOnRelease(useMemo(() => gpuResourcesOf(mesh), [mesh]))
  useEffect(() => admitRequestedSprays(pool, poolOrigin), [pool, poolOrigin])
  useFrame((_, delta) => {
    followRenderOrigin(pool.particles, poolOrigin)
    stepSprayPool(pool, delta)
    placePieces(pool, mesh, piece)
    recordFrameDraw(pool.particles.count)
  })
  return <primitive object={mesh} />
}

/** Each piece tumbles and shrinks away over its life, in its kind's colour. */
function placePieces(pool: SprayPool, mesh: InstancedMesh, piece: Object3D): void {
  const { particles } = pool
  for (let at = 0; at < particles.count; at++) {
    const size = pieceSizeAt(pool, at)
    piece.position.set(particles.x[at], particles.y[at], SPRAY_Z)
    piece.rotation.set(0, 0, pieceTurnAt(pool, at))
    piece.scale.set(size, size, 1)
    piece.updateMatrix()
    mesh.setMatrixAt(at, piece.matrix)
    mesh.setColorAt(at, KIND_COLOURS[pool.kinds[at]])
  }
  mesh.count = particles.count
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

/** The pool draws one call while it holds any piece. */
function recordFrameDraw(count: number): void {
  const { peak } = sprayPresence
  peak.drawCalls = Math.max(peak.drawCalls, count > 0 ? 1 : 0)
  peak.instances = Math.max(peak.instances, count)
}

function createSprayMesh(): InstancedMesh {
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial(), SPRAY_CAPACITY)
  // Seat a colour in every slot now, so the shader is built with per-piece colour from the start.
  for (let at = 0; at < SPRAY_CAPACITY; at++) mesh.setColorAt(at, KIND_COLOURS[0])
  mesh.count = 0
  mesh.frustumCulled = false
  return mesh
}

/** The quad, the material and the mesh's own per-piece buffers. */
function gpuResourcesOf(mesh: InstancedMesh) {
  return [mesh.geometry, mesh.material as MeshBasicMaterial, mesh]
}
