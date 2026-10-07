/**
 * The scorch each blast leaves round its crater (#109, `fx-blast-scorch`): a fixed pool of quads,
 * one per kept blast (`blastScorchRecord`), placed each frame and hidden when unused, so drawing
 * never allocates. Presentation only.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'
import {
  SCORCH_COLOUR,
  SCORCH_DARKNESS,
  SCORCH_INNER_FADE_M,
  SCORCH_OUTER_FADE_M,
  SCORCH_SLOTS,
} from '../constants/scene'
import { MM_PER_METRE } from '../constants/physics'
import { readBlastScorches } from '../store/blastScorchRecord'
import { chargeRadiusMm } from '../systems/economy/chargeSizes'
import { rgbOfHex } from '../systems/render/colour'
import type { ChargePlacement } from '../systems/render/chargeLook'
import { SCORCH_FRAGMENT_SHADER, SCORCH_VERTEX_SHADER } from './blastScorchShader'
import { useDisposeEachOnRelease } from './disposeOnRelease'

/** On the ground's face, under the planted charges (0.26). */
const SCORCH_Z = 0.2
/** The shipped size's scorch: `ChargeDetonated` gains its size with the scene layers (#213). */
const RADIUS_M = chargeRadiusMm(1) / MM_PER_METRE
const HALF_SIZE_M = RADIUS_M + SCORCH_OUTER_FADE_M

export function BlastScorches() {
  const meshes = useMemo(createScorchMeshes, [])
  // R3F never disposes a <primitive>.
  useDisposeEachOnRelease(useMemo(() => gpuResourcesOf(meshes), [meshes]))
  useFrame(() => placeScorches(meshes, readBlastScorches()))
  return (
    <>
      {meshes.map((mesh) => (
        <primitive key={mesh.id} object={mesh} />
      ))}
    </>
  )
}

function createScorchMeshes(): Mesh<PlaneGeometry, ShaderMaterial>[] {
  const geometry = new PlaneGeometry(HALF_SIZE_M * 2, HALF_SIZE_M * 2)
  return Array.from({ length: SCORCH_SLOTS }, (_, at) => {
    const mesh = new Mesh(geometry, createScorchMaterial(at))
    mesh.visible = false
    return mesh
  })
}

/** The slots share one quad; each has its own material. */
function gpuResourcesOf(meshes: readonly Mesh<PlaneGeometry, ShaderMaterial>[]) {
  return [meshes[0].geometry, ...meshes.map((mesh) => mesh.material)]
}

function createScorchMaterial(seed: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: SCORCH_VERTEX_SHADER,
    fragmentShader: SCORCH_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    uniforms: {
      // A display colour, as the shader writes it; three's Color would convert it to linear.
      uColour: { value: new Vector3(...rgbOfHex(SCORCH_COLOUR)) },
      uHalfSize: { value: HALF_SIZE_M },
      uRadius: { value: RADIUS_M },
      uInnerFade: { value: SCORCH_INNER_FADE_M },
      uOuterFade: { value: SCORCH_OUTER_FADE_M },
      uDarkness: { value: SCORCH_DARKNESS },
      uSeed: { value: seed },
    },
  })
}

function placeScorches(meshes: readonly Mesh[], scorches: readonly ChargePlacement[]): void {
  for (let at = 0; at < meshes.length; at++) placeScorch(meshes[at], scorches[at])
}

function placeScorch(mesh: Mesh, scorch: ChargePlacement | undefined): void {
  mesh.visible = scorch !== undefined
  if (scorch === undefined) return
  mesh.position.set(scorch.x, scorch.y, SCORCH_Z)
  mesh.rotation.set(0, 0, scorch.turn)
}
