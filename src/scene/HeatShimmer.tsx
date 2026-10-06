/**
 * The heat shimmer on the run vehicle (#113 Visibility, the #51 `fx-heat-shimmer` row): above the
 * heat gauge's throttle line a haze of rising heat bands wraps the body, stronger as the gauge
 * climbs to its max. Drawn additively in the vehicle's frame; its strength and clock live on the
 * material's uniforms, written each frame, never through React or the store.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { AdditiveBlending, ShaderMaterial } from 'three'
import { HEAT_SHIMMER_SIZE_M, HEAT_SHIMMER_Z } from '../constants/scene'
import { readLocalVehicle, useGameStore } from '../store/gameStore'
import { heatShimmerStrength } from '../systems/render/heatShimmer'

const SHIMMER_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// Rising bands of heat haze, brightest over the body and fading to the edge (fx-heat-shimmer).
const SHIMMER_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
void main() {
  vec2 fromCentre = vUv - 0.5;
  float falloff = 1.0 - smoothstep(0.15, 0.5, length(fromCentre));
  float sway = sin(vUv.x * 18.0 + uTime * 3.0) * 0.03;
  float bands = 0.5 + 0.5 * sin((vUv.y + sway) * 26.0 - uTime * 6.0);
  float alpha = uStrength * falloff * (0.25 + 0.35 * bands);
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * alpha, alpha);
}
`

export function HeatShimmer() {
  const material = useMemo(createShimmerMaterial, [])
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, delta) => {
    const planetIndex = useGameStore.getState().planetTier
    material.uniforms.uTime.value += delta
    material.uniforms.uStrength.value = heatShimmerStrength(planetIndex, readLocalVehicle().heat)
  })
  return (
    <mesh position={[0, 0, HEAT_SHIMMER_Z]} material={material}>
      <planeGeometry args={[HEAT_SHIMMER_SIZE_M, HEAT_SHIMMER_SIZE_M]} />
    </mesh>
  )
}

function createShimmerMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: SHIMMER_VERTEX_SHADER,
    fragmentShader: SHIMMER_FRAGMENT_SHADER,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}
