/**
 * The power-up effects' fixed pools (ticket 250): one point pool per effect run, each tinted the
 * colour of the effect it draws (#166 `POWER_UP_FX`) and sized as its run's milestone look says
 * (ticket 277), so four effects at once cost four draw calls however many motes they hold.
 * Emitting, stepping and uploading never allocate. Presentation only, on the render delta with its
 * own seed.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, PointsMaterial } from 'three'
import { drillPresence } from '../../../scene/drillPresence'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import {
  createParticlePool,
  sprayParticles,
  stepParticles,
  type ParticlePool,
  type Spray,
} from '../../../systems/render/particles'
import { createSeededRandom, type SeededRandom } from '../../../systems/seededRandom'
import {
  advanceFxRun,
  aimHullAt,
  aimMote,
  createFxRuns,
  FX_POOL_CAPACITY,
  FX_RUNS,
  motesDue,
  startItemFx,
  type FxHull,
  type FxRun,
  type FxRuns,
  type FxStart,
} from '../systems/render/powerUpFxFeed'

/** Over the drill sparks (0.3) and under the blast front (0.31): an effect is a quieter cue. */
const FX_Z = 0.305
const MOTE_SIZE_PIXELS = 3
const POWER_UP_FX_SEED = 0xf250

/** Each run is one point pool, one draw call, however full (#213). */
export const POWER_UP_FX_BUDGET = { drawCalls: FX_RUNS, instances: FX_RUNS * FX_POOL_CAPACITY }

export interface PowerUpFxPools {
  runs: FxRuns
  pools: ParticlePool[]
  geometries: BufferGeometry[]
  materials: PointsMaterial[]
  /** The look each material shows, so it is set only when its run changes effect or Mark. */
  looks: string[]
  random: SeededRandom
  /** Scratch: one mote's spray and the hull this frame. */
  spray: Spray
  hull: FxHull
}

export function createPowerUpFxPools(): PowerUpFxPools {
  return {
    runs: createFxRuns(),
    pools: Array.from({ length: FX_RUNS }, () => createParticlePool(FX_POOL_CAPACITY)),
    geometries: Array.from({ length: FX_RUNS }, createPointGeometry),
    materials: Array.from({ length: FX_RUNS }, createMoteMaterial),
    looks: Array.from({ length: FX_RUNS }, () => ''),
    random: createSeededRandom(POWER_UP_FX_SEED),
    spray: { x: 0, y: 0, dirX: 0, dirY: 1, speed: 0, spreadRadians: 0, lifeSeconds: 0 },
    hull: { x: 0, y: 0, aheadX: 1, aheadY: 0 },
  }
}

/** What the pools hold on the GPU, for `useDisposeEachOnRelease`. */
export function gpuResourcesOf(fx: PowerUpFxPools) {
  return [...fx.geometries, ...fx.materials]
}

export function startQueuedFx(fx: PowerUpFxPools, starts: readonly FxStart[]): void {
  for (const start of starts) startItemFx(fx.runs, start)
}

/** Moves every run and its motes on by the render delta, and emits what each run owes. */
export function stepPowerUpFx(fx: PowerUpFxPools, dt: number): void {
  readHull(fx.hull)
  for (let at = 0; at < FX_RUNS; at++) stepRun(fx, at, dt)
}

/** Uploads this frame's motes, each pool tinted and sized as its run's look says. */
export function drawPowerUpFx(fx: PowerUpFxPools): void {
  for (let at = 0; at < FX_RUNS; at++) drawRun(fx, at)
}

function readHull(hull: FxHull): void {
  hull.x = vehiclePresence.x
  hull.y = vehiclePresence.y
  aimHullAt(hull, drillPresence.nose.x, drillPresence.nose.y)
}

function stepRun(fx: PowerUpFxPools, at: number, dt: number): void {
  const run = fx.runs.runs[at]
  const pool = fx.pools[at]
  stepParticles(pool, dt)
  advanceFxRun(run, dt)
  const due = motesDue(run, dt)
  for (let mote = 0; mote < due; mote++) emitMote(fx, run, pool)
}

function emitMote(fx: PowerUpFxPools, run: FxRun, pool: ParticlePool): void {
  aimMote(run, fx.hull, fx.random, fx.spray)
  sprayParticles(pool, fx.random, fx.spray, 1)
}

function drawRun(fx: PowerUpFxPools, at: number): void {
  dressPool(fx, at, fx.runs.runs[at])
  uploadPoints(fx.pools[at], fx.geometries[at])
}

/** A freed run keeps its look while its last motes die out. */
function dressPool(fx: PowerUpFxPools, at: number, run: FxRun): void {
  const look = lookKeyOf(run)
  if (run.fx === null || fx.looks[at] === look) return
  fx.looks[at] = look
  fx.materials[at].color.set(run.look.colour)
  fx.materials[at].size = MOTE_SIZE_PIXELS * run.look.moteScale
}

function lookKeyOf(run: FxRun): string {
  return `${run.look.colour} ${run.look.moteScale}`
}

function uploadPoints(pool: ParticlePool, geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let at = 0; at < pool.count; at++) position.setXYZ(at, pool.x[at], pool.y[at], FX_Z)
  position.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
}

function createPointGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  const positions = new Float32Array(FX_POOL_CAPACITY * 3)
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setDrawRange(0, 0)
  return geometry
}

/** Motes glow like the drill's sparks, in their effect's colour. */
function createMoteMaterial(): PointsMaterial {
  return new PointsMaterial({
    size: MOTE_SIZE_PIXELS,
    sizeAttenuation: false,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
}
