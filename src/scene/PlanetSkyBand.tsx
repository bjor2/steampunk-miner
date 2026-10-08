/**
 * A band of light in the planet's sky (GD ruling on #293 Q1): the `planetSkyBand` provider's look
 * drawn as one ring mesh round the planet just above its surface, additive over the sky and behind
 * the ground, 1 draw call from #38's co-op headroom (outside the slices' `SCENE_LAYER_LINE`). With
 * no look the planet draws nothing. The ring is built once per planet; a frame only advances the
 * shader's clock, held still while reduce motion is on (the shake switch, #33, #48).
 */
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  Vector4,
  type Texture,
} from 'three'
import { SKY_BAND_Z } from '../constants/scene'
import { useGameStore } from '../store/gameStore'
import { planetParamsOf, type SessionPlanet } from '../systems/authority/planetOfState'
import { planetSkyBandOf, type PlanetSkyBandLook } from '../systems/registries/planetSkyBand'
import {
  skyBandRepeatOf,
  skyBandRibbonArtOf,
  skyBandRibbonMapOf,
  type SkyBandRibbonArt,
} from '../systems/render/skyBandLook'
import { skyBandRingOf } from '../systems/render/skyBandRing'
import { useAtlasTextureSet } from './atlasTextures'
import { useDisposeOnRelease } from './disposeOnRelease'
import { SHIPPED_ART } from './shippedArt'
import { showSkyBand } from './skyBandPresence'

const SKY_BAND_VERTEX_SHADER = /* glsl */ `
attribute vec2 aBand;
varying vec2 vBand;
void main() {
  vBand = aBand;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// Curtains of light rising from the band's lower edge and fading upward; the ribbon art, once
// final, gives their shape and the look its colour. The flicker dims a curtain at a time.
const SKY_BAND_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColour;
uniform float uTime;
uniform float uFlicker;
uniform float uHasRibbon;
uniform sampler2D uRibbon;
uniform vec4 uRibbonUv;
varying vec2 vBand;

float curtainsAt(vec2 band) {
  float along = band.x * 6.2831853;
  float rays = 0.55 + 0.45 * sin(along * 7.0 + 2.5 * sin(along * 2.0 + uTime * 0.35));
  float drift = 0.6 + 0.4 * sin(along * 3.0 - uTime * 0.2);
  float rise = smoothstep(0.0, 0.12, band.y) * pow(1.0 - band.y, 1.6);
  return rays * drift * rise;
}

float ribbonAt(vec2 band) {
  vec2 uv = vec2(
    mix(uRibbonUv.x, uRibbonUv.z, fract(band.x)),
    mix(uRibbonUv.y, uRibbonUv.w, band.y)
  );
  vec4 texel = texture2D(uRibbon, uv);
  return texel.a * max(texel.r, max(texel.g, texel.b));
}

void main() {
  float light = uHasRibbon > 0.5 ? ribbonAt(vBand) : curtainsAt(vBand);
  float flicker = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 3.1 + vBand.x * 13.0));
  vec3 glow = uColour * light * flicker;
  gl_FragColor = vec4(glow, light);
}
`

/** What the band shows on this planet: its ring's size, its look and its art. */
interface ShownSkyBand {
  radiusTiles: number
  look: PlanetSkyBandLook
  ribbonArt: SkyBandRibbonArt | null
}

export function PlanetSkyBand() {
  const index = useGameStore((state) => state.planetTier)
  const seed = useGameStore((state) => state.planetSeed)
  const shown = useMemo(() => shownSkyBandOf({ index, seed }), [index, seed])
  if (shown === null) return null
  if (shown.ribbonArt === null) return <SkyBandMesh shown={shown} ribbon={null} />
  return (
    <Suspense fallback={<SkyBandMesh shown={shown} ribbon={null} />}>
      <SkyBandMeshWithRibbon shown={shown} ribbonArt={shown.ribbonArt} />
    </Suspense>
  )
}

function SkyBandMeshWithRibbon({
  shown,
  ribbonArt,
}: {
  shown: ShownSkyBand
  ribbonArt: SkyBandRibbonArt
}) {
  const [ribbon] = useAtlasTextureSet([skyBandRibbonMapOf(ribbonArt)])
  return <SkyBandMesh shown={shown} ribbon={ribbon} />
}

function SkyBandMesh({ shown, ribbon }: { shown: ShownSkyBand; ribbon: Texture | null }) {
  const geometry = useMemo(() => createSkyBandGeometry(shown), [shown])
  const material = useMemo(() => createSkyBandMaterial(shown, ribbon), [shown, ribbon])
  useDisposeOnRelease(geometry)
  useDisposeOnRelease(material)
  useEffect(() => showSkyBand(shown.look, ribbon !== null), [shown, ribbon])
  useFrame((_, delta) => advanceSkyBandClock(material, delta))
  return <mesh geometry={geometry} material={material} position={[0, 0, SKY_BAND_Z]} />
}

function shownSkyBandOf(planet: SessionPlanet): ShownSkyBand | null {
  const params = planetParamsOf(planet)
  const look = params === null ? null : planetSkyBandOf(params)
  if (params === null || look === null) return null
  return { radiusTiles: params.radiusTiles, look, ribbonArt: skyBandRibbonArtOf(SHIPPED_ART, look) }
}

function createSkyBandGeometry(shown: ShownSkyBand): BufferGeometry {
  const ring = skyBandRingOf(shown.radiusTiles, shown.look, skyBandRepeatOf(shown.ribbonArt))
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(ring.positions, 3))
  geometry.setAttribute('aBand', new BufferAttribute(ring.bandCoords, 2))
  geometry.setIndex(new BufferAttribute(ring.indices, 1))
  return geometry
}

function createSkyBandMaterial(shown: ShownSkyBand, ribbon: Texture | null): ShaderMaterial {
  const uv = shown.ribbonArt?.uv ?? [0, 0, 1, 1]
  return new ShaderMaterial({
    vertexShader: SKY_BAND_VERTEX_SHADER,
    fragmentShader: SKY_BAND_FRAGMENT_SHADER,
    uniforms: {
      // Display values, as the terrain shader writes them (SkyBackground).
      uColour: { value: new Color(shown.look.colour).convertSRGBToLinear() },
      uTime: { value: 0 },
      uFlicker: { value: shown.look.flicker },
      uHasRibbon: { value: ribbon === null ? 0 : 1 },
      uRibbon: { value: ribbon },
      uRibbonUv: { value: new Vector4(...uv) },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

function advanceSkyBandClock(material: ShaderMaterial, delta: number): void {
  if (useGameStore.getState().prefs.shake) material.uniforms.uTime.value += delta
}
