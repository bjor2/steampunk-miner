/**
 * A blast is a disturbance for the collapse rules (spec #109 "Collapse risk", #43; #153: the
 * disturbance check runs on the crater rim): every collapse block whose centre lies within one
 * block of the blast's ground reach (its widened disc, D1 #860) is checked once, and each weak one not already collapsing starts its
 * telegraph, as the watch starts any other. Lining is never blasted away, so blocks whose lining
 * holds stay quiet as usual, and so do reinforced ones (ticket 365).
 *
 * A bare blast also rolls (D2 #861): each checked block that is not weak, has carved air and no
 * lined wall draws its seeded roll (`blastCollapseRoll.ts`) against its size's `collapseBp`, says
 * so in one `BlastCollapseRolled`, and under the chance starts a blast's telegraph
 * (`startBlastWarning`): the shared warning and refill, crushing nobody and leaving the rig's cell
 * and every cell a vehicle could not drill open. Sizes whose chance is 0 roll nothing.
 *
 * A live blast checks a block once its front is a block past the block's centre, so the block's
 * ground and its border are broken as they will stay, nearest blocks first, at most
 * `BLAST_COLLAPSE_CHECKS_PER_TICK` a tick (the TD caps how many telegraphs start in one tick); the
 * blocks still waiting when the ground is done are checked over the following ticks.
 */
import { COLLAPSE_BLOCK_SAMPLES } from '../../../constants/balance'
import { BLAST_COLLAPSE_CHECKS_PER_TICK } from '../../../constants/terrainBudget'
import { collapseBpOf } from '../../economy/chargeSizes'
import { chargeCentreMm } from '../../vehicle/vehicleCharges'
import { blockCentreMm, blockIdOf, blocksNear, type CollapseBlock } from '../../world/collapseBlock'
import type { PlanetParams } from '../../world/planetParams'
import { isBareOpenBlock } from '../../world/collapseWeakness'
import { MM_PER_SAMPLE } from '../../world/sampleGrid'
import type { AuthorityState } from '../authorityState'
import { entryOfBlock } from '../collapse/collapseState'
import {
  forcedWeaknessOf,
  startBlastWarning,
  startBurstWarning,
  weaknessOf,
  type WeakBlock,
} from '../collapse/collapseWatch'
import { chainEffects, type RuleEffect } from '../commandRule'
import type { DomainEventBodies, DomainEventBody } from '../domainEvent'
import type { BlastEvent } from '../../registries/blastEffects'
import { collapseRollOf, isRolledToCollapse } from './blastCollapseRoll'
import { groundRadiusMmOf } from './blastDisc'
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
export function collapseBlocksOf(blast: BlastEvent, params: PlanetParams): number {
  return disturbedBlocksOf(blast, params).length
}

/** Checks the blocks the front has passed (all of them once `isGroundDone`), up to the cap. */
export function checkCollapseBehindFront(
  state: AuthorityState,
  params: PlanetParams,
  live: LiveBlast,
  frontMm: number,
  isGroundDone: boolean,
): BlastCollapseCheck {
  const disturbed = disturbedBlocksOf(live.blast, params)
  const due = dueBlocksOf(disturbed, live.collapseChecks, frontMm, isGroundDone)
  const checks = blockChecksAmong(state, params, live.blast, due)
  const effect = chainEffects(state, checks.map(effectOfCheck))
  const triggered = checks.filter(isWarningStarted).length
  const checked = {
    ...live,
    collapseChecks: live.collapseChecks + due.length,
    collapsesTriggered: live.collapsesTriggered + triggered,
  }
  return { effect, live: checked, triggered }
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

/** The rim is the ground disc's (D1 #860): a widened blast disturbs the blocks round its reach. */
function disturbedBlocksOf(blast: BlastEvent, params: PlanetParams): readonly DisturbedBlock[] {
  const reachMm = groundRadiusMmOf(blast, params)
  const key = `${blast.tx},${blast.ty},${reachMm}`
  const known = disturbedByBlast.get(key)
  if (known !== undefined) return known
  const disturbed = disturbedBlocksAround(blast, reachMm)
  if (disturbedByBlast.size === REMEMBERED_BLASTS) disturbedByBlast.clear()
  disturbedByBlast.set(key, disturbed)
  return disturbed
}

/** Nearest first; `blocksNear` sorts by block id, and the stable sort keeps that on ties. */
function disturbedBlocksAround(blast: BlastEvent, reachMm: number): DisturbedBlock[] {
  const centre = chargeCentreMm(blast)
  return blocksNear(centre, reachMm + BLOCK_SIDE_MM)
    .map((block) => ({ block, passMm: distanceMm(centre, blockCentreMm(block)) + BLOCK_SIDE_MM }))
    .sort((a, b) => a.passMm - b.passMm)
}

function distanceMm(a: { xMm: number; yMm: number }, b: { xMm: number; yMm: number }): number {
  const dx = a.xMm - b.xMm
  const dy = a.yMm - b.yMm
  return Math.floor(Math.sqrt(dx * dx + dy * dy))
}

/** What checking one disturbed block found: a weak block, or a bare one's roll. */
type BlockCheck =
  | { verdict: 'weak'; weak: WeakBlock }
  | { verdict: 'rolled'; weak: WeakBlock; roll: BlastCollapseRoll }

type BlastCollapseRoll = Omit<DomainEventBodies['BlastCollapseRolled'], 'block'>

/** The checks of the blocks not collapsing yet that are weak or roll, in the order given. */
function blockChecksAmong(
  state: AuthorityState,
  params: PlanetParams,
  blast: BlastEvent,
  blocks: readonly CollapseBlock[],
): BlockCheck[] {
  return blocks.flatMap((block) => {
    const check = checkOfBlock(state, params, blast, block)
    return check === null ? [] : [check]
  })
}

function checkOfBlock(
  state: AuthorityState,
  params: PlanetParams,
  blast: BlastEvent,
  block: CollapseBlock,
): BlockCheck | null {
  if (entryOfBlock(state.collapse, blockIdOf(block)) !== null) return null
  const weakness = weaknessOf(state, params, block)
  if (weakness !== null) return { verdict: 'weak', weak: { block, weakness } }
  return rolledCheckOf(state, params, blast, block)
}

/** A bare open block's roll against the size's chance; null when the size never collapses. */
function rolledCheckOf(
  state: AuthorityState,
  params: PlanetParams,
  blast: BlastEvent,
  block: CollapseBlock,
): BlockCheck | null {
  const collapseBp = collapseBpOf(blast.size)
  if (collapseBp === 0 || !isBareOpenBlock(state.world, params, block)) return null
  const weakness = forcedWeaknessOf(state, params, block)
  if (weakness === null) return null
  const roll = collapseRollOf(params, block, blast.blastSeq)
  const isCollapsing = isRolledToCollapse(roll, collapseBp)
  const rolled = { blastSeq: blast.blastSeq, collapseBp, roll, isCollapsing }
  return { verdict: 'rolled', weak: { block, weakness }, roll: rolled }
}

function effectOfCheck(check: BlockCheck): (state: AuthorityState) => RuleEffect {
  if (check.verdict === 'weak') return (state) => startBurstWarning(state, check.weak)
  return (state) => rolledEffectOf(state, check.weak, check.roll)
}

/** The roll said, then the blast's telegraph when it collapses. */
function rolledEffectOf(
  state: AuthorityState,
  weak: WeakBlock,
  roll: BlastCollapseRoll,
): RuleEffect {
  const rolled: DomainEventBody = {
    type: 'BlastCollapseRolled',
    block: blockIdOf(weak.block),
    ...roll,
  }
  if (!roll.isCollapsing) return { state, events: [rolled] }
  const warned = startBlastWarning(state, weak)
  return { state: warned.state, events: [rolled, ...warned.events] }
}

function isWarningStarted(check: BlockCheck): boolean {
  return check.verdict === 'weak' || check.roll.isCollapsing
}
