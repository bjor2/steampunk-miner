/**
 * The power-up effects fed into fixed particle pools (ticket 250; the looks are #166's
 * `POWER_UP_FX` and `fxFrameOf`, drawn by the kernel's procedural particles, #51). Each use of an
 * item starts its effects on one of a few runs, the oldest replaced when all are busy; each frame
 * a run owes motes at the rate its frame's strands and strength set, placed at the frame's reach
 * around where its kind is anchored and flowing in or out as its kind moves. A use at a Mark that
 * has reached a milestone draws with that milestone's look (`milestoneLook.ts`, ticket 277).
 * Presentation only: time is the render delta in ticks, nothing here reaches the authority, the
 * log or a digest.
 */
import { TICKS_PER_SECOND } from '../../../../constants/physics'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { particlesDue, type EmissionCarry, type Spray } from '../../../../systems/render/particles'
import type { SeededRandom } from '../../../../systems/seededRandom'
import { markLadderOfItem } from '../itemMarks'
import { reachedMilestonesOf } from '../markMilestones'
import type { MarkLadder } from '../techNode'
import { fxLookOf, type FxLook } from './milestoneLook'
import { writeFlareShellPoint, writeFxFrame, type FxFrame } from './powerUpFx'
import { powerUpFxOfItem, type FxKind, type PowerUpFx } from './techGear'

/** Four effects at once, a pool each: one draw call apiece inside the #213 scene-layer line. */
export const FX_RUNS = 4
export const FX_POOL_CAPACITY = 64

/** A mote lives this long and drifts this fast outward; inward motes cross the reach in a life. */
const MOTE_LIFE_SECONDS = 0.6
const MOTE_DRIFT_MPS = 0.8
/** Motes a second per strand at full strength; a one-line effect (a ring) draws as six strands. */
const MOTES_PER_STRAND_SECOND = 8
const MIN_MOTE_STRANDS = 6
/** Half the wedge a cone, a plume or the coil's freed cell fans across. */
const WEDGE_HALF_RADIANS = 0.5
const HALF_TURN = Math.PI

/** Where a kind is drawn from: the hull as it moves, or the tile the item was used on. */
type FxAnchor = 'hull' | 'origin' | 'shell'
type FxFlow = 'inward' | 'outward'
type FxArc = 'round' | 'ahead' | 'behind'

interface KindMotion {
  anchor: FxAnchor
  flow: FxFlow
  arc: FxArc
}

/**
 * How each #166 kind moves: the drain's brine lines and the shifter's nodules crawl to the hull,
 * the lodestone gathers where it was set, the coil frees the cell ahead, rings and the twists stay
 * where they were raised, the cone looks along the drill, the flare burns at its shell, the
 * curtain stands round the hull and the boost plume trails behind it.
 */
const KIND_MOTION: Readonly<Record<FxKind, KindMotion>> = {
  stream: { anchor: 'hull', flow: 'inward', arc: 'round' },
  drag: { anchor: 'hull', flow: 'inward', arc: 'round' },
  gather: { anchor: 'origin', flow: 'inward', arc: 'round' },
  free: { anchor: 'hull', flow: 'outward', arc: 'ahead' },
  ring: { anchor: 'origin', flow: 'outward', arc: 'round' },
  cone: { anchor: 'hull', flow: 'outward', arc: 'ahead' },
  burn: { anchor: 'shell', flow: 'outward', arc: 'round' },
  curtain: { anchor: 'hull', flow: 'outward', arc: 'round' },
  plume: { anchor: 'hull', flow: 'outward', arc: 'behind' },
  line: { anchor: 'origin', flow: 'inward', arc: 'ahead' },
  plate: { anchor: 'origin', flow: 'inward', arc: 'round' },
}

/** The hull this frame, metres, and the unit direction its drill points. */
export interface FxHull {
  x: number
  y: number
  aheadX: number
  aheadY: number
}

/** One effect being drawn, or a free run when `fx` is null. */
export interface FxRun {
  fx: PowerUpFx | null
  /** How the motes draw: the table's look, changed by each milestone the use's Mark reached. */
  look: FxLook
  ticks: number
  /** The centre of the tile the item was used on, metres. */
  originX: number
  originY: number
  /** When it started among all runs, so a busy set replaces its oldest. */
  startedAt: number
  carry: EmissionCarry
  /** Scratch: this frame's look and the flare shell's place. */
  frame: FxFrame
  shell: [number, number]
}

export interface FxRuns {
  runs: FxRun[]
  started: number
}

/** A use the layer draws: the item, the tile it was used on and the Mark it acted at (#249). */
export interface FxStart {
  itemId: string
  tx: number
  ty: number
  mark: number
}

/** The ladder a use's item steps, so a spec can hand in its own. */
export type LadderOfItem = (itemId: string) => MarkLadder | null

export function createFxRuns(): FxRuns {
  return { runs: Array.from({ length: FX_RUNS }, createFxRun), started: 0 }
}

/** Every use in a batch of authority events; switching a toggle off draws nothing. */
export function fxStartsOf(events: readonly DomainEvent[]): FxStart[] {
  return events.flatMap((event) => {
    if (event.type !== 'power-up-core.PowerUpUsed' || event.toggledOn === false) return []
    return [{ itemId: event.itemId, tx: event.originTx, ty: event.originTy, mark: event.mark }]
  })
}

/**
 * Starts each of the item's effects on a free run, or on the oldest when all are busy, in the
 * look of the milestones the use's Mark reached.
 */
export function startItemFx(
  runs: FxRuns,
  start: FxStart,
  ladderOf: LadderOfItem = markLadderOfItem,
): void {
  const reached = reachedMilestonesOf(ladderOf(start.itemId), start.mark)
  for (const fx of powerUpFxOfItem(start.itemId)) {
    startRun(runs, claimRun(runs), fx, start, fxLookOf(fx, reached))
  }
}

/** Moves the run on by the render delta, freeing it once its effect is over. */
export function advanceFxRun(run: FxRun, dt: number): void {
  if (run.fx === null) return
  run.ticks += dt * TICKS_PER_SECOND
  if (writeFxFrame(run.fx, run.ticks, run.frame).isOver) run.fx = null
}

/** The motes the run owes this frame; a Mark 6 look doubles the strands. */
export function motesDue(run: FxRun, dt: number): number {
  if (run.fx === null) return 0
  const strands = Math.max(run.frame.strands, MIN_MOTE_STRANDS) * run.look.strandScale
  return particlesDue(run.carry, run.frame.alpha * strands * MOTES_PER_STRAND_SECOND, dt)
}

/** Writes one mote of the run into `spray`: on its arc at the frame's reach, flowing its way. */
export function aimMote(run: FxRun, hull: FxHull, random: SeededRandom, spray: Spray): void {
  if (run.fx === null) return
  const motion = KIND_MOTION[run.fx.kind]
  aimAcrossArc(spray, motion.arc, hull, random)
  placeAtReach(run, motion, hull, spray)
  flowMote(run.frame, motion.flow, spray)
}

/** The drill's direction from the hull to its nose; straight ahead (+X) when they coincide. */
export function aimHullAt(hull: FxHull, noseX: number, noseY: number): void {
  const dx = noseX - hull.x
  const dy = noseY - hull.y
  const length = Math.hypot(dx, dy)
  hull.aheadX = length === 0 ? 1 : dx / length
  hull.aheadY = length === 0 ? 0 : dy / length
}

/** The ids of the effects drawn now, for the debug read. */
export function activeFxIdsOf(runs: FxRuns): string[] {
  return runs.runs.flatMap((run) => (run.fx === null ? [] : [run.fx.id]))
}

/** Each effect drawn now with its look, for the debug read. */
export function activeFxLooksOf(runs: FxRuns): { fxId: string; look: FxLook }[] {
  return runs.runs.flatMap((run) => (run.fx === null ? [] : [{ fxId: run.fx.id, look: run.look }]))
}

function createFxRun(): FxRun {
  return {
    fx: null,
    look: { colour: '', strandScale: 1, moteScale: 1 },
    ticks: 0,
    originX: 0,
    originY: 0,
    startedAt: 0,
    carry: { owed: 0 },
    frame: { reachM: 0, alpha: 0, strands: 0, isOver: true },
    shell: [0, 0],
  }
}

function claimRun(runs: FxRuns): FxRun {
  const free = runs.runs.find((run) => run.fx === null)
  return (
    free ?? runs.runs.reduce((oldest, run) => (run.startedAt < oldest.startedAt ? run : oldest))
  )
}

/** A tile is a metre (#4): the effect starts from the middle of the tile it was used on. */
function startRun(runs: FxRuns, run: FxRun, fx: PowerUpFx, start: FxStart, look: FxLook): void {
  run.fx = fx
  run.look = look
  run.ticks = 0
  run.originX = start.tx + 1 / 2
  run.originY = start.ty + 1 / 2
  run.startedAt = runs.started
  run.carry.owed = 0
  writeFxFrame(fx, 0, run.frame)
  runs.started += 1
}

function aimAcrossArc(spray: Spray, arc: FxArc, hull: FxHull, random: SeededRandom): void {
  const angle = arcAngleOf(arc, hull) + (2 * random.nextFloat() - 1) * arcHalfOf(arc)
  spray.dirX = Math.cos(angle)
  spray.dirY = Math.sin(angle)
}

function arcAngleOf(arc: FxArc, hull: FxHull): number {
  const ahead = Math.atan2(hull.aheadY, hull.aheadX)
  return arc === 'behind' ? ahead + HALF_TURN : ahead
}

function arcHalfOf(arc: FxArc): number {
  return arc === 'round' ? HALF_TURN : WEDGE_HALF_RADIANS
}

function placeAtReach(run: FxRun, motion: KindMotion, hull: FxHull, spray: Spray): void {
  writeAnchor(run, motion.anchor, hull, spray)
  spray.x += spray.dirX * run.frame.reachM
  spray.y += spray.dirY * run.frame.reachM
}

/** The flare climbs from the mortar and arcs to the side the drill faces. */
function writeAnchor(run: FxRun, anchor: FxAnchor, hull: FxHull, spray: Spray): void {
  if (anchor === 'hull') return writePoint(spray, hull.x, hull.y)
  if (anchor === 'origin' || run.fx === null) return writePoint(spray, run.originX, run.originY)
  const [across, up] = writeFlareShellPoint(run.fx, run.ticks, run.shell)
  writePoint(spray, run.originX + across * Math.sign(hull.aheadX || 1), run.originY + up)
}

function writePoint(spray: Spray, x: number, y: number): void {
  spray.x = x
  spray.y = y
}

/** Inward motes cross the reach to the anchor in a life; outward ones drift on out. */
function flowMote(frame: FxFrame, flow: FxFlow, spray: Spray): void {
  const isInward = flow === 'inward'
  spray.speed = isInward ? frame.reachM / MOTE_LIFE_SECONDS : MOTE_DRIFT_MPS
  spray.spreadRadians = 0
  spray.lifeSeconds = MOTE_LIFE_SECONDS
  if (!isInward) return
  spray.dirX = -spray.dirX
  spray.dirY = -spray.dirY
}
