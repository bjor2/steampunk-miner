/**
 * A point pool whose every piece wears its own colour (D8, ticket 868): the kernel particle pool
 * (flat arrays, no allocation) beside an rgb array it keeps in step, uploaded as a `color`
 * attribute so one `Points` draw call shows fire, embers, dust, smoke and chips in the colours the
 * plan gives them. Stepping mirrors the kernel's compaction, so a dead piece's colour slot is
 * filled by the last live one as its position is.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  PointsMaterial,
} from 'three'
import {
  advanceParticle,
  createParticlePool,
  removeParticleAt,
  sprayParticles,
  type ParticlePool,
  type Spray,
} from '../../../systems/render/particles'
import type { Rgb } from '../../../systems/render/colour'
import type { SeededRandom } from '../../../systems/seededRandom'

export interface ColouredPointPool {
  pool: ParticlePool
  /** rgb per piece, by the pool's index. */
  colour: Float32Array
  geometry: BufferGeometry
  material: PointsMaterial
}

export function createColouredPointPool(
  capacity: number,
  sizePixels: number,
  isAdditive: boolean,
): ColouredPointPool {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 3), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(capacity * 3), 3))
  geometry.setDrawRange(0, 0)
  return {
    pool: createParticlePool(capacity),
    colour: new Float32Array(capacity * 3),
    geometry,
    material: new PointsMaterial({
      size: sizePixels,
      sizeAttenuation: false,
      transparent: true,
      vertexColors: true,
      blending: isAdditive ? AdditiveBlending : NormalBlending,
      depthWrite: false,
    }),
  }
}

/** Sprays up to `count` pieces in `rgb`; a full pool takes no more. */
export function sprayColoured(
  points: ColouredPointPool,
  random: SeededRandom,
  spray: Spray,
  count: number,
  rgb: Rgb,
): void {
  const before = points.pool.count
  sprayParticles(points.pool, random, spray, count)
  for (let at = before; at < points.pool.count; at++) writeColour(points, at, rgb)
}

/** Ages and moves every piece; a dead one's slot, colour included, takes the last live one. */
export function stepColoured(points: ColouredPointPool, dt: number): void {
  const { pool } = points
  let at = 0
  while (at < pool.count) {
    if (advanceParticle(pool, at, dt)) at++
    else removeColouredAt(points, at)
  }
}

export function uploadColoured(points: ColouredPointPool, z: number): void {
  const { pool, geometry, colour } = points
  const position = geometry.getAttribute('position') as BufferAttribute
  const colours = geometry.getAttribute('color') as BufferAttribute
  for (let at = 0; at < pool.count; at++) {
    position.setXYZ(at, pool.x[at], pool.y[at], z)
    colours.setXYZ(at, colour[at * 3], colour[at * 3 + 1], colour[at * 3 + 2])
  }
  position.needsUpdate = true
  colours.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
}

function writeColour(points: ColouredPointPool, at: number, [r, g, b]: Rgb): void {
  points.colour[at * 3] = r
  points.colour[at * 3 + 1] = g
  points.colour[at * 3 + 2] = b
}

function removeColouredAt(points: ColouredPointPool, at: number): void {
  const last = points.pool.count - 1
  points.colour[at * 3] = points.colour[last * 3]
  points.colour[at * 3 + 1] = points.colour[last * 3 + 1]
  points.colour[at * 3 + 2] = points.colour[last * 3 + 2]
  removeParticleAt(points.pool, at)
}
