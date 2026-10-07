/**
 * Placing the burst's pooled quads each frame (CLAUDE.md frame rules): one instanced mesh for the
 * chunks, one for the coins and the flare, written from the pure flight maths through scratch
 * objects made once, so a frame allocates nothing. A seat whose piece is not in the air is
 * scaled to nothing, and an empty mesh is hidden, so it costs no draw.
 */
import { Color, Object3D, type InstancedMesh } from 'three'
import { oreLookOf } from '../../../systems/render/oreLook'
import { BURST_TIMING } from '../systems/burstTiming'
import { chunkPointAt, stackCoinPointAt, type FlightPoint } from '../systems/render/burstFlight'
import type { SellBurst } from '../systems/sellBurst'
import type { SellShopPoints } from './sellShopPoints'

export const BURST_CHUNK_POOL = BURST_TIMING.chunks.max
/** Every coin, plus the flare's sunburst in the last seat. */
export const BURST_COIN_POOL = BURST_TIMING.coins.max + 1
const FLARE_SEAT = BURST_COIN_POOL - 1

/** In front of the Exchange's parts (0.005 to 0.015); the flare just behind the coins. */
const CHUNK_Z = 0.025
const COIN_Z = 0.03
const FLARE_Z = 0.028

/** Placeholder sizes until the #214 sheets: a unit chunk, then the collapsed sizes (m). */
const CHUNK_SIZE_M = [0, 0.3, 0.42, 0.55] as const
const COIN_SIZE_M = 0.34
const FLARE_SIZE_M = { from: 1, to: 3.2 }

/** The flat brass cog-coin and the gold sunburst, placeholders for #214's spin sheet. */
const COIN_BRASS = new Color('#d9b45a')
const FLARE_GOLD = new Color('#ffd76a')

/** Coins spin edge-on and back about twice a second. */
const COIN_SPIN_PER_TICK = 0.2

export interface BurstPieces {
  pose: Object3D
  colour: Color
  point: FlightPoint
  /** The burst the colours were last written for. */
  colouredBurst: SellBurst | null
  /** The last tick whose sounds were played. */
  cuedTick: number
}

export function createBurstPieces(): BurstPieces {
  return {
    pose: new Object3D(),
    colour: new Color(),
    point: { x: 0, y: 0 },
    colouredBurst: null,
    cuedTick: 0,
  }
}

/** Chunks in their ore's colour, coins brass, the flare gold: once per burst or merge. */
export function colourBurstPieces(
  chunks: InstancedMesh,
  coins: InstancedMesh,
  burst: SellBurst | null,
  pieces: BurstPieces,
): void {
  if (burst === null || burst === pieces.colouredBurst) return
  colourChunks(chunks, burst, pieces.colour)
  for (let seat = 0; seat < FLARE_SEAT; seat++) coins.setColorAt(seat, COIN_BRASS)
  coins.setColorAt(FLARE_SEAT, FLARE_GOLD)
  markColoursChanged(chunks)
  markColoursChanged(coins)
  pieces.colouredBurst = burst
}

export function placeBurstChunks(
  mesh: InstancedMesh,
  burst: SellBurst | null,
  tick: number,
  points: SellShopPoints,
  pieces: BurstPieces,
): void {
  if (burst === null) return hideMesh(mesh)
  let seat = 0
  let shown = 0
  for (const wave of burst.waves) {
    for (let index = 0; index < wave.chunks.length; index++, seat++) {
      const elapsed = tick - wave.startTick
      const count = wave.chunks.length
      const isAloft = chunkPointAt(index, count, elapsed, points.chute, points.crown, pieces.point)
      const size = isAloft ? CHUNK_SIZE_M[wave.chunks[index].size] : 0
      setSeat(mesh, seat, pieces, CHUNK_Z, size, size)
      if (isAloft) shown += 1
    }
  }
  showSeats(mesh, seat, shown)
}

export function placeBurstCoins(
  mesh: InstancedMesh,
  burst: SellBurst | null,
  tick: number,
  points: SellShopPoints,
  pieces: BurstPieces,
): void {
  if (burst === null) return hideMesh(mesh)
  const shown =
    placeStackCoins(mesh, burst, tick, points, pieces) +
    placeFlare(mesh, burst, tick, points, pieces)
  showSeats(mesh, BURST_COIN_POOL, shown)
}

function colourChunks(mesh: InstancedMesh, burst: SellBurst, colour: Color): void {
  let seat = 0
  for (const wave of burst.waves) {
    for (const chunk of wave.chunks) {
      const [red, green, blue] = oreLookOf('metal', chunk.tier).colour
      mesh.setColorAt(seat++, colour.setRGB(red, green, blue))
    }
  }
}

/** The coins over the stack, spinning; the seats past the burst's coins stay empty. */
function placeStackCoins(
  mesh: InstancedMesh,
  burst: SellBurst,
  tick: number,
  points: SellShopPoints,
  pieces: BurstPieces,
): number {
  let seat = 0
  let shown = 0
  for (const wave of burst.waves) {
    for (let index = 0; index < wave.coins; index++, seat++) {
      const isAloft = stackCoinPointAt(wave, index, tick, points.stack, pieces.point)
      const spin = Math.abs(Math.cos(tick * COIN_SPIN_PER_TICK + index))
      setSeat(
        mesh,
        seat,
        pieces,
        COIN_Z,
        isAloft ? COIN_SIZE_M * spin : 0,
        isAloft ? COIN_SIZE_M : 0,
      )
      if (isAloft) shown += 1
    }
  }
  for (; seat < FLARE_SEAT; seat++) setSeat(mesh, seat, pieces, COIN_Z, 0, 0)
  return shown
}

/** The sunburst over the stack, swelling over its 18 ticks once the last coin lands. */
function placeFlare(
  mesh: InstancedMesh,
  burst: SellBurst,
  tick: number,
  points: SellShopPoints,
  pieces: BurstPieces,
): number {
  const share = flareShareAt(burst, tick)
  const size =
    share === null ? 0 : FLARE_SIZE_M.from + (FLARE_SIZE_M.to - FLARE_SIZE_M.from) * share
  pieces.point.x = points.stack.x
  pieces.point.y = points.stack.y + BURST_TIMING.coins.riseM
  setSeat(mesh, FLARE_SEAT, pieces, FLARE_Z, size, size)
  return share === null ? 0 : 1
}

function flareShareAt(burst: SellBurst, tick: number): number | null {
  if (burst.flareStartTick === null) return null
  const share = (tick - burst.flareStartTick) / BURST_TIMING.flare.ticks
  return share >= 0 && share < 1 ? share : null
}

/** A zero size hides a seat without moving the rest of the pool. */
function setSeat(
  mesh: InstancedMesh,
  seat: number,
  pieces: BurstPieces,
  z: number,
  width: number,
  height: number,
): void {
  pieces.pose.position.set(pieces.point.x, pieces.point.y, z)
  pieces.pose.scale.set(width, height, 1)
  pieces.pose.updateMatrix()
  mesh.setMatrixAt(seat, pieces.pose.matrix)
}

function showSeats(mesh: InstancedMesh, seats: number, shown: number): void {
  mesh.count = seats
  mesh.visible = shown > 0
  mesh.instanceMatrix.needsUpdate = true
}

function hideMesh(mesh: InstancedMesh): void {
  mesh.count = 0
  mesh.visible = false
}

function markColoursChanged(mesh: InstancedMesh): void {
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true
}
