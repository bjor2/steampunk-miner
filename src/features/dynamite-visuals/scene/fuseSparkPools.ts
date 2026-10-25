/**
 * The fuse sparks (D7, ticket 866; "each type has its own fuse sparks"): a point pool per charge
 * type in its spark colour, fed every frame by each live fused charge from its lamp, out along the
 * planet's radial up, at the fuse row's rate, building over the fuse's last seconds (D8, ticket
 * 868); a remote charge has no fuse and throws none. Each pool
 * is one draw call however full; emitting, stepping and uploading never allocate.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three'
import { SPARK_SIZE_PIXELS } from '../../../constants/scene'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import {
  createParticlePool,
  particlesDue,
  sprayParticles,
  stepParticles,
  type EmissionCarry,
  type ParticlePool,
  type Spray,
} from '../../../systems/render/particles'
import { writeChargePlacement, type ChargePlacement } from '../../../systems/render/chargePlacement'
import { createSeededRandom, type SeededRandom } from '../../../systems/seededRandom'
import type { PlantedCharge } from '../../../systems/vehicle/vehicleCharges'
import { chargeTypeOf } from '../../../systems/economy/chargeSizes'
import {
  BLAST_FRONT_SEED,
  FUSE_SPARK_SPREAD_RADIANS,
  FUSE_SPARKS_PER_TYPE,
} from '../systems/render/blastLookConstants'
import { chargeTypes, fuseSparksOf, type FuseSparks } from '../systems/render/chargeTypeLook'
import { dynamiteSizes } from '../systems/render/dynamiteArt'
import { fuseBuildOf } from '../systems/render/fuseBuild'
import { fuseTicksLeftOf, plantedLampQuadsOf } from '../systems/render/plantedDynamiteLook'
import { SPARK_Z } from './BlastMarksLayer'

export interface FuseSparkPools {
  /** By type, in `chargeTypes()` order. */
  pools: ParticlePool[]
  looks: FuseSparks[]
  geometries: BufferGeometry[]
  points: Points[]
  /** Fractions of a spark owed per planted slot, so the rate holds at any frame rate. */
  carries: EmissionCarry[]
  /** Each size's lamp in the prop's frame, metres from the charge's centre, by size − 1. */
  lamps: [number, number][]
  random: SeededRandom
  spray: Spray
  centre: ChargePlacement
  resources: { dispose(): void }[]
}

const HALF_TURN = Math.PI / 2
/** Sparks per slot owed between frames; slots beyond the planted pool never emit. */
const CARRY_SLOTS = 8

export function createFuseSparkPools(): FuseSparkPools {
  const types = chargeTypes()
  const pools = types.map(() => createParticlePool(FUSE_SPARKS_PER_TYPE))
  const looks = types.map((type) => fuseSparksOf(type))
  const geometries = pools.map(() => createPointGeometry(FUSE_SPARKS_PER_TYPE))
  const materials = looks.map((look) => createSparkMaterial(look.colour))
  const points = geometries.map((geometry, at) => createPoints(geometry, materials[at]))
  return {
    pools,
    looks,
    geometries,
    points,
    carries: Array.from({ length: CARRY_SLOTS }, () => ({ owed: 0 })),
    lamps: dynamiteSizes().map(lampOffsetOf),
    random: createSeededRandom(BLAST_FRONT_SEED),
    spray: { x: 0, y: 0, dirX: 0, dirY: 1, speed: 0, spreadRadians: 0, lifeSeconds: 0 },
    centre: { x: 0, y: 0, turn: 0 },
    resources: [...geometries, ...materials],
  }
}

export function stepFuseSparks(sparks: FuseSparkPools, dt: number): void {
  for (const pool of sparks.pools) stepParticles(pool, dt)
}

/** Every live fused charge throws its type's sparks from its lamp, up the planet's radial. */
export function throwFuseSparks(
  sparks: FuseSparkPools,
  charges: readonly PlantedCharge[],
  tick: number,
  dt: number,
): void {
  const slots = Math.min(charges.length, sparks.carries.length)
  for (let slot = 0; slot < slots; slot++) throwFromCharge(sparks, slot, charges[slot], tick, dt)
}

export function drawFuseSparks(sparks: FuseSparkPools): void {
  sparks.pools.forEach((pool, at) => uploadPoints(pool, sparks.geometries[at]))
}

function throwFromCharge(
  sparks: FuseSparkPools,
  slot: number,
  charge: PlantedCharge,
  tick: number,
  dt: number,
): void {
  const ticksLeft = fuseTicksLeftOf(charge, tick)
  if (!Number.isFinite(ticksLeft)) return
  const typeAt = chargeTypes().indexOf(chargeTypeOf(charge.size))
  const look = sparks.looks[typeAt]
  const rate = look.sparksPerSecond * fuseBuildOf(ticksLeft)
  const due = particlesDue(sparks.carries[slot], rate, dt)
  if (due === 0) return
  aimAtLamp(sparks, charge, look)
  sprayParticles(sparks.pools[typeAt], sparks.random, sparks.spray, due)
}

/** The spray scratch at the charge's lamp, pointing along the planet's radial up. */
function aimAtLamp(sparks: FuseSparkPools, charge: PlantedCharge, look: FuseSparks): void {
  const { spray, centre } = sparks
  const { x, y, turn } = writeChargePlacement(charge, centre)
  const [lampX, lampUp] = sparks.lamps[charge.size - 1] ?? [0, 0]
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  spray.x = x + lampX * cos - lampUp * sin
  spray.y = y + lampX * sin + lampUp * cos
  spray.dirX = Math.cos(turn + HALF_TURN)
  spray.dirY = Math.sin(turn + HALF_TURN)
  spray.speed = look.speedMetresPerSecond
  spray.spreadRadians = FUSE_SPARK_SPREAD_RADIANS
  spray.lifeSeconds = look.lifeSeconds
}

/** A size's lamp pivot in the prop's frame; the charge's centre when the prop has no lamp. */
function lampOffsetOf(size: number): [number, number] {
  const lamp = plantedLampQuadsOf(SHIPPED_ART, size)[0]
  return lamp === undefined ? [0, 0] : [lamp.pivot[0], lamp.pivot[1]]
}

function uploadPoints(pool: ParticlePool, geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let at = 0; at < pool.count; at++) position.setXYZ(at, pool.x[at], pool.y[at], SPARK_Z)
  position.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
}

function createPointGeometry(capacity: number): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 3), 3))
  geometry.setDrawRange(0, 0)
  return geometry
}

/** Sparks glow like the drill's, in the type's colour. */
function createSparkMaterial(colour: string): PointsMaterial {
  return new PointsMaterial({
    color: colour,
    size: SPARK_SIZE_PIXELS,
    sizeAttenuation: false,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
}

function createPoints(geometry: BufferGeometry, material: PointsMaterial): Points {
  const points = new Points(geometry, material)
  points.frustumCulled = false
  return points
}
