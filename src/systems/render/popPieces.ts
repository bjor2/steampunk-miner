/**
 * The material pops' share of the kernel spray pool (ticket 616, the VS conditions on #442): what a
 * pop piece carries beside its spray slot. Its start in the rig's frame, its side, colour, glint
 * and merged count; the spray slot's age and life time its flight. Flat arrays the size of the
 * pool, moved with their slot, so a pop allocates nothing.
 */
import type { RigPoint } from '../materialPop/popFlight'

/** A pop as the pool takes it; callers may reuse one scratch request. */
export interface PopRequest {
  start: RigPoint
  sizeM: number
  /** 0xRRGGBB. */
  colour: number
  isGlinting: boolean
  lifeSeconds: number
  serial: number
  /** Rare-or-better, special or artefact: it holds the reserved slots and is never evicted. */
  isGuarded: boolean
}

export interface PopPieces {
  /** 1 where the slot holds a pop. */
  isPop: Uint8Array
  startAlong: Float32Array
  startUpward: Float32Array
  sizeM: Float32Array
  colour: Uint32Array
  isGlinting: Uint8Array
  /** Cells merged into the pop, 1 for its own. */
  count: Uint16Array
  serial: Uint32Array
}

export function createPopPieces(capacity: number): PopPieces {
  return {
    isPop: new Uint8Array(capacity),
    startAlong: new Float32Array(capacity),
    startUpward: new Float32Array(capacity),
    sizeM: new Float32Array(capacity),
    colour: new Uint32Array(capacity),
    isGlinting: new Uint8Array(capacity),
    count: new Uint16Array(capacity),
    serial: new Uint32Array(capacity),
  }
}

export function writePopPiece(pops: PopPieces, at: number, request: PopRequest): void {
  pops.isPop[at] = 1
  pops.startAlong[at] = request.start.along
  pops.startUpward[at] = request.start.upward
  pops.sizeM[at] = request.sizeM
  pops.colour[at] = request.colour
  pops.isGlinting[at] = request.isGlinting ? 1 : 0
  pops.count[at] = 1
  pops.serial[at] = request.serial
}

/** A spray piece's slot: no pop. */
export function clearPopPiece(pops: PopPieces, at: number): void {
  pops.isPop[at] = 0
}

export function movePopPiece(pops: PopPieces, from: number, to: number): void {
  pops.isPop[to] = pops.isPop[from]
  pops.startAlong[to] = pops.startAlong[from]
  pops.startUpward[to] = pops.startUpward[from]
  pops.sizeM[to] = pops.sizeM[from]
  pops.colour[to] = pops.colour[from]
  pops.isGlinting[to] = pops.isGlinting[from]
  pops.count[to] = pops.count[from]
  pops.serial[to] = pops.serial[from]
}

/** The live pop `serial`'s slot among the first `count`, or -1 once it landed or was pushed out. */
export function slotOfPop(pops: PopPieces, count: number, serial: number): number {
  for (let at = 0; at < count; at++) {
    if (pops.isPop[at] === 1 && pops.serial[at] === serial) return at
  }
  return -1
}

/** The pop's start, read into `out`. */
export function popStartAt(pops: PopPieces, at: number, out: RigPoint): RigPoint {
  out.along = pops.startAlong[at]
  out.upward = pops.startUpward[at]
  return out
}
