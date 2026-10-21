/**
 * Option B's pops as the kernel spray layer takes them (ticket 616, #442): while the session's
 * material pop mode is B, every batch of cells the carve hook finishes (`listenForCarvedCells`,
 * ticket 615) is popped into the layer's pool from the rig as it is drawn now, on the carve tick;
 * each frame the rate follows the canvas width and a queued special may start. In mode A nothing
 * is asked. Client-only: it reads the hook, the presence registries and the rarity ladder, and
 * writes nothing the authority, the store or the digest holds.
 */
import { POP_NOSE_REACH_M } from '../constants/materialPop'
import { readAuthorityState } from '../store/authorityLink'
import { listenForCarvedCells } from '../store/carveCompleteBroadcast'
import { useGameStore } from '../store/gameStore'
import { planetParamsOf } from '../systems/authority/planetOfState'
import type { CarvedCell } from '../systems/materialPop/carveWatch'
import type { RigFrame } from '../systems/materialPop/popFlight'
import {
  createPopIntake,
  popCarvedCells,
  popQueuedSpecial,
  type PopIntake,
  type PopScene,
} from '../systems/materialPop/popIntake'
import { NO_POP_LADDER, type PopLadder } from '../systems/materialPop/popLook'
import { popRatePerSecondOf } from '../systems/materialPop/popThinning'
import { kindLookProvider, type KindLookProvider } from '../systems/registries/kindLook'
import type { RarityLook } from '../systems/render/kindLookTable'
import type { SprayPool } from '../systems/render/sprayPool'
import { drillPresence } from './drillPresence'
import { sprayPresence } from './sprayPresence'
import { vehiclePresence } from './vehiclePresence'

export interface ScenePops {
  intake: PopIntake
  scene: PopScene
  /** The look provider the ladder was read from: its rows are fixed, so it is read once. */
  ladderSource: KindLookProvider | null
}

export function createScenePops(pool: SprayPool): ScenePops {
  const scene: PopScene = { rig: createRigFrame(), ladder: NO_POP_LADDER }
  const tallies = { spray: sprayPresence, pops: sprayPresence.pops }
  return { intake: createPopIntake(pool, scene, tallies), scene, ladderSource: null }
}

/** Returns the call that stops popping. */
export function popCarvedCellsInModeB(pops: ScenePops): () => void {
  return listenForCarvedCells((cells) => popCellsIfModeB(pops, cells))
}

/** Once a frame: the rate for this canvas width, and a queued special on its tick. */
export function paceScenePops(pops: ScenePops, widthPixels: number): void {
  pops.intake.thinning.ratePerSecond = popRatePerSecondOf(widthPixels)
  popQueuedSpecial(pops.intake, readAuthorityState().tick)
}

/** The rig as drawn this frame: centre, local up, drill facing and the nose just ahead. */
export function readDrawnRig(out: RigFrame): RigFrame {
  out.x = vehiclePresence.x
  out.y = vehiclePresence.y
  out.up.x = drillPresence.up.x
  out.up.y = drillPresence.up.y
  out.ahead.x = drillPresence.ahead.x
  out.ahead.y = drillPresence.ahead.y
  out.nose.x = out.x + out.ahead.x * POP_NOSE_REACH_M
  out.nose.y = out.y + out.ahead.y * POP_NOSE_REACH_M
  return out
}

export function createRigFrame(): RigFrame {
  return { x: 0, y: 0, up: { x: 0, y: 1 }, ahead: { x: 0, y: -1 }, nose: { x: 0, y: -1 } }
}

function popCellsIfModeB(pops: ScenePops, cells: readonly CarvedCell[]): void {
  if (useGameStore.getState().materialPopMode !== 'B') return
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null) return
  readDrawnRig(pops.scene.rig)
  followRarityLadder(pops)
  popCarvedCells(pops.intake, cells, params, state.tick)
}

/** The material table's ladder: a tint per rarity step above common, its top step its length. */
function followRarityLadder(pops: ScenePops): void {
  const provider = kindLookProvider()
  if (provider === pops.ladderSource) return
  pops.ladderSource = provider
  pops.scene.ladder = provider === null ? NO_POP_LADDER : ladderOf(provider.rarityLooks())
}

function ladderOf(looks: readonly RarityLook[]): PopLadder {
  return { tints: looks.map((look) => look.tint), topStep: looks.length }
}
