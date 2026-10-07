/**
 * A blast is a disturbance for the collapse rules (spec #109 "Collapse risk", #43; #153: the
 * disturbance check runs on the crater rim): every collapse block whose centre lies within one
 * block of the blast's radius is checked once, and each weak one not already collapsing starts its
 * telegraph, as the watch starts any other. Lining is never blasted away, so blocks whose lining
 * holds stay quiet as usual.
 *
 * A live blast checks a block once its front is a block past the block's centre, so the block's
 * ground and its border are broken as they will stay, nearest blocks first, at most
 * `BLAST_COLLAPSE_CHECKS_PER_TICK` a tick (the TD caps how many telegraphs start in one tick); the
 * blocks still waiting when the ground is done are checked over the following ticks.
 */
import { COLLAPSE_BLOCK_SAMPLES } from '../../../constants/balance'
import { BLAST_COLLAPSE_CHECKS_PER_TICK } from '../../../constants/terrainBudget'
import { chargeCentreMm } from '../../vehicle/vehicleCharges'
import { blockCentreMm, blockIdOf, blocksNear, type CollapseBlock } from '../../world/collapseBlock'
import { weaknessOfBlock } from '../../world/collapseWeakness'
import type { PlanetParams } from '../../world/planetParams'
import { MM_PER_SAMPLE } from '../../world/sampleGrid'
import type { AuthorityState } from '../authorityState'
import { entryOfBlock } from '../collapse/collapseState'
import { startWarning, type WeakBlock } from '../collapse/collapseWatch'
import { chainEffects, type RuleEffect } from '../commandRule'
import type { BlastEvent } from '../../registries/blastEffects'
import type { LiveBlast } from './liveBlast'

const BLOCK_SIDE_MM = COLLAPSE_BLOCK_SAMPLES * MM_PER_SAMPLE

export interface BlastCollapseCheck {
  effect: RuleEffect
  live: LiveBlast
  /** Warnings the checks started. */
  triggered: number
}

/** A block the blast disturbs, and how far its front must reach before the block is checked. */
interface DisturbedBlock {
  block: CollapseBlock
  passMm: number
}

/** The last few blasts' disturbed blocks: a blast asks for its own every tick it is live. */
const disturbedByBlast = new Map<string, readonly DisturbedBlock[]>()
const REMEMBERED_BLASTS = 8

/** Every block the blast disturbs, checked or not. */
export function collapseBlocksOf(blast: BlastEvent): number {
  return disturbedBlocksOf(blast).length
}

/** Checks the blocks the front has passed (all of them once `isGroundDone`), up to the cap. */
export function checkCollapseBehindFront(
  state: AuthorityState,
  params: PlanetParams,
  live: LiveBlast,
  frontMm: number,
  isGroundDone: boolean,
): BlastCollapseCheck {
  const due = dueBlocksOf(disturbedBlocksOf(live.blast), live.collapseChecks, frontMm, isGroundDone)
  const fresh = freshWeakBlocksAmong(state, params, due)
  const effect = chainEffects(
    state,
    fresh.map((weak) => (current: AuthorityState) => startWarning(current, weak, false)),
  )
  const checked = {
    ...live,
    collapseChecks: live.collapseChecks + due.length,
    collapsesTriggered: live.collapsesTriggered + fresh.length,
  }
  return { effect, live: checked, triggered: fresh.length }
}

function dueBlocksOf(
  disturbed: readonly DisturbedBlock[],
  checked: number,
  frontMm: number,
  isGroundDone: boolean,
): CollapseBlock[] {
  const due: CollapseBlock[] = []
  for (let at = checked; at < disturbed.length; at++) {
    if (due.length === BLAST_COLLAPSE_CHECKS_PER_TICK) break
    if (!isGroundDone && disturbed[at].passMm > frontMm) break
    due.push(disturbed[at].block)
  }
  return due
}

function disturbedBlocksOf(blast: BlastEvent): readonly DisturbedBlock[] {
  const key = `${blast.tx},${blast.ty},${blast.radiusMm}`
  const known = disturbedByBlast.get(key)
  if (known !== undefined) return known
  const disturbed = disturbedBlocksAround(blast)
  if (disturbedByBlast.size === REMEMBERED_BLASTS) disturbedByBlast.clear()
  disturbedByBlast.set(key, disturbed)
  return disturbed
}

/** Nearest first; `blocksNear` sorts by block id, and the stable sort keeps that on ties. */
function disturbedBlocksAround(blast: BlastEvent): DisturbedBlock[] {
  const centre = chargeCentreMm(blast)
  return blocksNear(centre, blast.radiusMm + BLOCK_SIDE_MM)
    .map((block) => ({ block, passMm: distanceMm(centre, blockCentreMm(block)) + BLOCK_SIDE_MM }))
    .sort((a, b) => a.passMm - b.passMm)
}

function distanceMm(a: { xMm: number; yMm: number }, b: { xMm: number; yMm: number }): number {
  const dx = a.xMm - b.xMm
  const dy = a.yMm - b.yMm
  return Math.floor(Math.sqrt(dx * dx + dy * dy))
}

/** The weak blocks among `blocks` that are not collapsing yet. */
function freshWeakBlocksAmong(
  state: AuthorityState,
  params: PlanetParams,
  blocks: readonly CollapseBlock[],
): WeakBlock[] {
  return blocks.flatMap((block) => {
    const weakness = weaknessOfBlock(state.world, params, block)
    const isCollapsing = entryOfBlock(state.collapse, blockIdOf(block)) !== null
    return weakness === null || isCollapsing ? [] : [{ block, weakness }]
  })
}
