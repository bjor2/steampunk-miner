/**
 * The collapse telegraph (#43 Sequence 1, #41 feel): over every block warning or refilling, a crack
 * that grows segment by segment through the 1 s warning and dust falling toward the planet's centre,
 * thicker as the refill nears. Read every frame from the authority replica, never through React;
 * the dust and the cracks are fixed pools, so stepping and uploading never allocate. Presentation
 * only, on the render delta with its own fixed seed. The rumble and the crash are feedback cues.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  PointsMaterial,
} from 'three'
import {
  COLLAPSE_DUST_CAPACITY,
  COLLAPSE_DUST_COLOUR,
  COLLAPSE_DUST_FALL_SPEED,
  COLLAPSE_DUST_FULL,
  COLLAPSE_DUST_LIFE_SECONDS,
  COLLAPSE_DUST_SEED,
  COLLAPSE_DUST_SIZE_PIXELS,
  COLLAPSE_DUST_START,
  COLLAPSE_TELEGRAPH_BLOCKS,
  CRACK_COLOUR,
  CRACKS_PER_BLOCK,
} from '../constants/scene'
import { readCollapse } from '../store/collapseReads'
import {
  crackSegmentsAt,
  createTelegraphSlots,
  writeCrackSegment,
  writeTelegraphBlocks,
  type TelegraphBlock,
} from '../systems/render/collapseTelegraph'
import {
  createParticlePool,
  particlesDue,
  sprayParticles,
  stepParticles,
  type EmissionCarry,
  type ParticlePool,
  type Spray,
} from '../systems/render/particles'
import { createSeededRandom, type SeededRandom } from '../systems/seededRandom'

/** Cracks lie on the ground's face; dust falls in front of it, behind the sparks. */
const CRACK_Z = 0.27
const DUST_Z = 0.29

interface Telegraph {
  slots: TelegraphBlock[]
  carries: EmissionCarry[]
  dust: ParticlePool
  random: SeededRandom
  spray: Spray
  /** One segment's ends, rewritten for every segment drawn. */
  segment: Float32Array
}

export function CollapseTelegraph() {
  const telegraph = useMemo(createTelegraph, [])
  const cracks = useMemo(createCrackLines, [])
  const dust = useMemo(createDustPoints, [])

  useFrame((_, delta) => {
    const { collapse, tick } = readCollapse()
    const count = writeTelegraphBlocks(telegraph.slots, collapse, tick)
    stepParticles(telegraph.dust, delta)
    shedDust(telegraph, count, delta)
    uploadCracks(telegraph, count, cracks.geometry)
    uploadDust(telegraph.dust, dust.geometry)
  })

  return (
    <>
      <primitive object={cracks} />
      <points geometry={dust.geometry} material={dust.material} frustumCulled={false} />
    </>
  )
}

function createTelegraph(): Telegraph {
  return {
    slots: createTelegraphSlots(COLLAPSE_TELEGRAPH_BLOCKS),
    carries: Array.from({ length: COLLAPSE_TELEGRAPH_BLOCKS }, () => ({ owed: 0 })),
    dust: createParticlePool(COLLAPSE_DUST_CAPACITY),
    random: createSeededRandom(COLLAPSE_DUST_SEED),
    spray: {
      x: 0,
      y: 0,
      dirX: 0,
      dirY: -1,
      speed: COLLAPSE_DUST_FALL_SPEED,
      spreadRadians: 0.25,
      lifeSeconds: COLLAPSE_DUST_LIFE_SECONDS,
    },
    segment: new Float32Array(4),
  }
}

function createCrackLines(): LineSegments {
  const geometry = new BufferGeometry()
  const vertices = COLLAPSE_TELEGRAPH_BLOCKS * CRACKS_PER_BLOCK * 2
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3))
  geometry.setDrawRange(0, 0)
  const lines = new LineSegments(geometry, new LineBasicMaterial({ color: CRACK_COLOUR }))
  lines.frustumCulled = false
  return lines
}

function createDustPoints(): { geometry: BufferGeometry; material: PointsMaterial } {
  const geometry = new BufferGeometry()
  const positions = new Float32Array(COLLAPSE_DUST_CAPACITY * 3)
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setDrawRange(0, 0)
  const material = new PointsMaterial({
    color: COLLAPSE_DUST_COLOUR,
    size: COLLAPSE_DUST_SIZE_PIXELS,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  })
  return { geometry, material }
}

/** Each block sheds dust from a random point inside it, falling toward the planet's centre. */
function shedDust(telegraph: Telegraph, count: number, delta: number): void {
  const { slots, carries, dust, random, spray } = telegraph
  for (let at = 0; at < count; at++) {
    const block = slots[at]
    const rate = COLLAPSE_DUST_START + (COLLAPSE_DUST_FULL - COLLAPSE_DUST_START) * block.progress
    const due = particlesDue(carries[at], rate, delta)
    aimDownAt(spray, block)
    for (let particle = 0; particle < due; particle++) {
      spray.x = block.x0 + block.size * random.nextFloat()
      spray.y = block.y0 + block.size * random.nextFloat()
      sprayParticles(dust, random, spray, 1)
    }
  }
}

function aimDownAt(spray: Spray, block: TelegraphBlock): void {
  const cx = block.x0 + block.size / 2
  const cy = block.y0 + block.size / 2
  const length = Math.hypot(cx, cy) || 1
  spray.dirX = -cx / length
  spray.dirY = -cy / length
}

function uploadCracks(telegraph: Telegraph, count: number, geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  let vertex = 0
  for (let at = 0; at < count; at++) {
    const block = telegraph.slots[at]
    for (let index = 0; index < crackSegmentsAt(block.progress); index++) {
      writeCrackSegment(block, index, telegraph.segment)
      position.setXYZ(vertex++, telegraph.segment[0], telegraph.segment[1], CRACK_Z)
      position.setXYZ(vertex++, telegraph.segment[2], telegraph.segment[3], CRACK_Z)
    }
  }
  position.needsUpdate = true
  geometry.setDrawRange(0, vertex)
}

function uploadDust(pool: ParticlePool, geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let at = 0; at < pool.count; at++) position.setXYZ(at, pool.x[at], pool.y[at], DUST_Z)
  position.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
}
