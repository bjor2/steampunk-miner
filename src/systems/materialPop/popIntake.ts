/**
 * Option B's intake (ticket 616): the carved cells of one answered batch become pops in the kernel
 * spray pool. Each cell that sent a unit to the hold is read as a find, the batch is thinned
 * (`popThinning.ts`), and every pop that starts is placed in the rig's frame as the rig is drawn
 * now, so it starts on its cell's carve tick. Client presentation only: it reads the carve hook's
 * cells and never the authority's state, so credit, the codex and the digest never depend on it.
 * The finds' scratch grows to the largest batch once; after that a pop allocates nothing.
 */
import type { PlanetParams } from '../world/planetParams'
import type { CarvedCell } from './carveWatch'
import { createPopFind, readPopFind, type PopFind } from './popFinds'
import type { RigFrame } from './popFlight'
import type { PopLadder } from './popLook'
import { createPopRequest, writePopRequest } from './popRequest'
import {
  createPopThinning,
  startQueuedSpecial,
  thinPopFinds,
  type PopSink,
  type PopTally,
  type PopThinning,
} from './popThinning'
import type { PopRequest } from '../render/popPieces'
import { admitPop, mergeIntoPop, type SprayPool, type SprayTally } from '../render/sprayPool'

export interface PopIntake {
  pool: SprayPool
  thinning: PopThinning
  finds: PopFind[]
  request: PopRequest
  sink: PopSink
}

/** Where pops are drawn from this batch: the rig as drawn and the table's rarity ladder. */
export interface PopScene {
  rig: RigFrame
  ladder: PopLadder
}

/** Pops count in `tallies.spray` as the pool admits them and in `tallies.pops` as they thin. */
export function createPopIntake(
  pool: SprayPool,
  scene: PopScene,
  tallies: { spray: SprayTally; pops: PopTally },
): PopIntake {
  const request = createPopRequest()
  const sink: PopSink = {
    startPop: (find, serial) =>
      admitPop(
        pool,
        writePopRequest(find, scene.rig, scene.ladder, serial, request),
        tallies.spray,
      ),
    mergeIntoPop: (serial) => mergeIntoPop(pool, serial),
  }
  return { pool, thinning: createPopThinning(tallies.pops), finds: [], request, sink }
}

/** One batch's carved cells, carved at `tick`, into pops. */
export function popCarvedCells(
  intake: PopIntake,
  cells: readonly CarvedCell[],
  params: PlanetParams,
  tick: number,
): void {
  const count = readFinds(intake, cells, params)
  thinPopFinds(intake.thinning, intake.finds, count, tick, intake.sink)
}

/** A queued special starts once its tick has room: the scene calls this every frame. */
export function popQueuedSpecial(intake: PopIntake, tick: number): void {
  startQueuedSpecial(intake.thinning, tick, intake.sink)
}

function readFinds(intake: PopIntake, cells: readonly CarvedCell[], params: PlanetParams): number {
  let count = 0
  for (const cell of cells) {
    if (readPopFind(cell, params, findSlot(intake.finds, count))) count++
  }
  return count
}

function findSlot(finds: PopFind[], at: number): PopFind {
  if (at === finds.length) finds.push(createPopFind())
  return finds[at]
}
