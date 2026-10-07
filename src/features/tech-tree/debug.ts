/**
 * The tree's debug actions (spec #161 section 5), as `steampunkDebug.features['tech-tree']`:
 * `unlockAll()` and `jumpToDepth(N)` grant nodes through the `debug.tech-tree.unlockThrough`
 * command, so they replay and log `debug_command_applied` and never count as play;
 * `shapeProblems()` prints the shape test over the registered tree; `getUnlocked()` reads the
 * local player's researched nodes for specs. `getRig()` reads what the rig draws now (ticket 250):
 * the mounted items, each asset at its point, each cradle's Mark plate and the power-up effects
 * running; `previewPowerUpFx(itemId)` plays an item's effects at the vehicle through the real
 * layer, presentation only: no command and no log line.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { iconUrlOf } from '../../ui/vectorIcons'
import { powerUpFxPresence } from './scene/powerUpFxPresence'
import { previewFxAtVehicle } from './store/powerUpFxFeed'
import { readRigItems, rigSightOfItems } from './store/rigReads'
import type { MarkPlate } from './systems/render/markPlate'
import { activeFxIdsOf } from './systems/render/powerUpFxFeed'
import type { RigMount } from './systems/render/rigGear'
import { powerUpFxOfItem } from './systems/render/techGear'
import { registeredTechTree, unlockAllPlanetOf } from './systems/techTree'
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
  previewPowerUpFx: (itemId) => previewItemFx(itemId),
}

function readRig() {
  const items = readRigItems()
  const sight = rigSightOfItems(SHIPPED_ART, items)
  return {
    ok: true as const,
    items,
    mounts: sight.mounts.map(listedMount),
    plates: sight.plates.map(listedPlate),
    fx: readFx(),
  }
}

function listedMount(mount: RigMount) {
  const partIds = mount.quads.map((quad) => quad.partId)
  return { assetId: mount.assetId, attachId: mount.attachId, partIds }
}

function listedPlate(plate: MarkPlate) {
  const { slot, itemId, mark, isGilded } = plate
  return { slot, itemId, mark, isGilded, rivets: plate.rivets.length }
}

function readFx() {
  const runs = powerUpFxPresence.runs
  return runs === null
    ? { isDrawn: false, started: 0, active: [] }
    : { isDrawn: true, started: runs.started, active: activeFxIdsOf(runs) }
}

function previewItemFx(itemId: unknown): DebugResult {
  if (typeof itemId !== 'string' || powerUpFxOfItem(itemId).length === 0) {
    return { ok: false, problems: [`${String(itemId)} has no power-up effect`] }
  }
  previewFxAtVehicle(itemId)
  return { ok: true }
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
