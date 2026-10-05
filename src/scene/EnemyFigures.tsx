/**
 * Draws the active enemies with their S7c Blender art (#68, #48 "organic and chitinous against
 * the brass vehicle"): each body is its kind's part cut from the atlas, lit like the vehicle's
 * parts (#38 lit 2.5D) and stood on local up. Tier and telegraph still tint and size it
 * (`enemyLookOf`; the chitin is pale so the tint reads) and the halo glows as before. Same fixed
 * pool as the placeholders, so the draw count does not change (#38: at most 150). The placeholders
 * draw while the maps transcode, and instead of the art while any enemy asset is a placeholder.
 */
import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  type Mesh,
  type MeshStandardMaterial,
  type PlaneGeometry,
  type Texture,
} from 'three'
import { MM_PER_METRE } from '../constants/physics'
import { readEnemies } from '../store/gameStore'
import type { AtlasUv } from '../systems/art/assetLook'
import type { Enemy } from '../systems/authority/combat/combatState'
import { ENEMY_KINDS, type EnemyKind } from '../systems/economy/economyDefinition'
import {
  enemyArtOf,
  enemyRollOf,
  isEveryEnemyArtFinal,
  type EnemyArt,
} from '../systems/render/enemyArt'
import type { Rgb } from '../systems/render/colour'
import { enemyLookOf } from '../systems/render/enemyPlaceholder'
import { createAtlasQuad } from './atlasQuadGeometry'
import { useAtlasTextureSet } from './atlasTextures'
import { EnemyPlaceholders } from './EnemyPlaceholders'
import {
  createEnemySlots,
  createHaloGeometry,
  ENEMY_Z,
  fillEnemySlots,
  placeHalo,
  type DrawEnemy,
} from './enemyPool'

/** The albedo alpha is a hard part mask (#52); cut, don't blend. */
const MASK_CUTOFF = 0.5
/** Wet chitin: a little glossier than the vehicle's matte brass (0.55). */
const CHITIN_ROUGHNESS = 0.45
const MAPS_PER_KIND = 3

/** One kind's look on the pool's material: its quad and its three maps. */
interface EnemySkin {
  geometry: PlaneGeometry
  width: number
  albedo: Texture
  normal: Texture
  emissive: Texture
  /** 0 when the kind has no emissive map (its albedo stands in, unlit, so no shader recompiles). */
  glow: number
}

type EnemySkins = Readonly<Record<EnemyKind, EnemySkin>>

const ARTS = ENEMY_KINDS.map(enemyArtOf)
const IS_ART_FINAL = isEveryEnemyArtFinal()

export function EnemyFigures() {
  if (!IS_ART_FINAL) return <EnemyPlaceholders />
  return (
    <Suspense fallback={<EnemyPlaceholders />}>
      <EnemyAtlasBodies />
    </Suspense>
  )
}

function EnemyAtlasBodies() {
  const textures = useAtlasTextureSet(useMemo(mapUrlsOfArts, []))
  const skins = useMemo(() => skinsOf(textures), [textures])
  const slots = useRef(createEnemySlots())
  const haloGeometry = useMemo(createHaloGeometry, [])
  const draw = useMemo(() => drawEnemyWith(skins), [skins])
  const first = skins[ENEMY_KINDS[0]]
  useFrame(() => fillEnemySlots(slots.current, readEnemies(), draw))
  // Every body starts on the first kind's maps, so swapping kinds later never recompiles.
  return (
    <>
      {slots.current.map((slot, at) => (
        <group key={at}>
          <mesh ref={(mesh) => (slot.halo = mesh)} geometry={haloGeometry} visible={false}>
            <meshBasicMaterial transparent blending={AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh ref={(mesh) => (slot.body = mesh)} geometry={first.geometry} visible={false}>
            <meshStandardMaterial
              map={first.albedo}
              normalMap={first.normal}
              emissiveMap={first.emissive}
              emissive="#ffffff"
              roughness={CHITIN_ROUGHNESS}
              alphaTest={MASK_CUTOFF}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** Albedo, normal and emissive per kind, in kind order; a kind with no glow repeats its albedo. */
function mapUrlsOfArts(): string[] {
  return ARTS.flatMap(({ maps }) =>
    maps === null ? [] : [maps.albedo, maps.normal, maps.emissive ?? maps.albedo],
  )
}

function skinsOf(textures: readonly Texture[]): EnemySkins {
  const entries = ENEMY_KINDS.map((kind, at) => [kind, skinOf(ARTS[at], textures, at)])
  return Object.fromEntries(entries) as EnemySkins
}

function skinOf(art: EnemyArt, textures: readonly Texture[], at: number): EnemySkin {
  const [albedo, normal, emissive] = textures.slice(at * MAPS_PER_KIND, (at + 1) * MAPS_PER_KIND)
  // Only drawn once every enemy asset is final, so every quad is cut from its atlas.
  const quad = art.quad as EnemyArt['quad'] & { uv: AtlasUv }
  return {
    geometry: createAtlasQuad(quad),
    width: quad.size[0],
    albedo,
    normal,
    emissive,
    glow: art.maps?.emissive === null ? 0 : 1,
  }
}

function drawEnemyWith(skins: EnemySkins): DrawEnemy {
  return (body: Mesh, halo: Mesh, enemy: Enemy) => drawEnemy(body, halo, enemy, skins)
}

function drawEnemy(body: Mesh, halo: Mesh, enemy: Enemy, skins: EnemySkins): void {
  const look = enemyLookOf(enemy.kind, enemy.phase, enemy.tier)
  const skin = skins[enemy.kind]
  const x = enemy.x / MM_PER_METRE
  const y = enemy.y / MM_PER_METRE
  body.geometry = skin.geometry
  body.position.set(x, y, ENEMY_Z)
  body.rotation.z = enemyRollOf(x, y)
  body.scale.setScalar(look.size / skin.width)
  dressBody(body.material as MeshStandardMaterial, skin, look.colour)
  placeHalo(halo, x, y, look)
}

function dressBody(material: MeshStandardMaterial, skin: EnemySkin, colour: Rgb): void {
  material.map = skin.albedo
  material.normalMap = skin.normal
  material.emissiveMap = skin.emissive
  material.emissiveIntensity = skin.glow
  material.color.setRGB(...colour)
}
