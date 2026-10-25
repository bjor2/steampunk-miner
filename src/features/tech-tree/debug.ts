/**
 * The tree's debug actions (spec #161 section 5), as `steampunkDebug.features['tech-tree']`:
 * `unlockAll()` and `jumpToDepth(N)` grant nodes through the `debug.tech-tree.unlockThrough`
 * command, so they replay and log `debug_command_applied` and never count as play;
 * `shapeProblems()` prints the shape test over the registered tree; `getUnlocked()` reads the
 * local player's researched nodes for specs. `getRig()` reads what the rig draws now (ticket 250):
 * the mounted items, each asset at its point, each cradle's Mark plate with its milestone studs,
 * its pips and its finish band past Mark 9 (ticket 884), with what a showing look swap covers left
 * off as the car leaves it (ticket 892), and the power-up effects running with their looks (ticket 277); `previewPowerUpFx(itemId, mark?)`
 * plays an item's effects at the vehicle through the real layer, at the Mark the item acts at
 * unless `mark` says otherwise, presentation only: no command and no log line. `getForks()` reads
 * every registered fork branch, whether the local player has it active and the parts it hangs on
 * the rig (ticket 270).
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { partMotion } from '../../scene/partMotionPresence'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { iconUrlOf } from '../../ui/vectorIcons'
import { powerUpFxPresence } from './scene/powerUpFxPresence'
import { previewFxAtVehicle } from './store/powerUpFxFeed'
import { readCarriedRig, rigSightOfCarried } from './store/rigReads'
import { forkChoicesOf } from './systems/forkSection'
import { activeBranchOf } from './systems/forkNode'
import { researchedMarkOf } from './systems/itemMarks'
import { forkMountsOf } from './systems/render/forkPieces'
import type { MarkPlate } from './systems/render/markPlate'
import { activeFxIdsOf, activeFxLooksOf } from './systems/render/powerUpFxFeed'
import type { RigMount } from './systems/render/rigGear'
import { powerUpFxOfItem } from './systems/render/techGear'
import { registeredTechTree, unlockAllPlanetOf, type ForkBranchNode } from './systems/techTree'
import { unlockedNodeIdsOf } from './systems/techTreeSection'
import { registeredTreeShapeProblems } from './systems/treeShape'

export const techTreeDebugActions: Readonly<Record<string, DebugAction>> = {
  unlockAll: () => grantThrough(unlockAllPlanetOf(registeredTechTree(), currentPlanet())),
  jumpToDepth: (planetIndex) => grantThrough(planetIndex as number),
  shapeProblems: () => ({
    ok: true,
    problems: registeredTreeShapeProblems((iconId) => iconUrlOf(iconId) !== null),
  }),
  getUnlocked: () => ({
    ok: true,
    unlocked: unlockedNodeIdsOf(readAuthorityState(), useGameStore.getState().playerId),
  }),
  getRig: () => readRig(),
  getForks: () => ({ ok: true, branches: registeredTechTree().forkBranches.map(listedBranch) }),
  previewPowerUpFx: (itemId, mark) => previewItemFx(itemId, mark),
}

function readRig() {
  const rig = readCarriedRig()
  const sight = rigSightOfCarried(SHIPPED_ART, rig, partMotion.requested.coveredItemIds)
  return {
    ok: true as const,
    items: rig.items,
    mounts: sight.mounts.map(listedMount),
    plates: sight.plates.map(listedPlate),
    fx: readFx(),
  }
}

function listedBranch({ lane, branch }: ForkBranchNode) {
  const choices = forkChoicesOf(readAuthorityState(), useGameStore.getState().playerId)
  const isActive = activeBranchOf(choices, lane) === branch
  return { lane, branch, isActive, mounts: forkMountsOf(lane, branch) }
}

function listedMount(mount: RigMount) {
  const partIds = mount.quads.map((quad) => quad.partId)
  return { assetId: mount.assetId, attachId: mount.attachId, partIds }
}

function listedPlate(plate: MarkPlate) {
  const { slot, itemId, mark, isGilded, band } = plate
  const [rivets, studs, pips] = [plate.rivets.length, plate.studs.length, plate.pips.length]
  return {
    slot,
    itemId,
    mark,
    isGilded,
    rivets,
    studs,
    pips,
    band,
    finish: plate.finish?.name ?? null,
  }
}

function readFx() {
  const runs = powerUpFxPresence.runs
  return runs === null
    ? { isDrawn: false, started: 0, active: [], looks: [] }
    : {
        isDrawn: true,
        started: runs.started,
        active: activeFxIdsOf(runs),
        looks: activeFxLooksOf(runs),
      }
}

function previewItemFx(itemId: unknown, mark: unknown): DebugResult {
  if (typeof itemId !== 'string' || powerUpFxOfItem(itemId).length === 0) {
    return { ok: false, problems: [`${String(itemId)} has no power-up effect`] }
  }
  if (mark !== undefined && !Number.isInteger(mark)) {
    return { ok: false, problems: [`${String(mark)} is not a Mark`] }
  }
  previewFxAtVehicle(itemId, mark === undefined ? actingMarkOf(itemId) : (mark as number))
  return { ok: true }
}

/** The Mark a use of the item would act at: the researched Mark, 0 for none (#249). */
function actingMarkOf(itemId: string): number {
  return researchedMarkOf(readAuthorityState(), useGameStore.getState().playerId, itemId)
}

function grantThrough(planetIndex: number) {
  return submitSliceDebugCommand({
    type: 'debug.tech-tree.unlockThrough',
    payload: { planetIndex },
  })
}

function currentPlanet(): number {
  return readAuthorityState().planet.index
}
