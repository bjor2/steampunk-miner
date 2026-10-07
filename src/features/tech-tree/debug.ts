/**
 * The tree's debug actions (spec #161 section 5), as `steampunkDebug.features['tech-tree']`:
 * `unlockAll()` and `jumpToDepth(N)` grant nodes through the `debug.tech-tree.unlockThrough`
 * command, so they replay and log `debug_command_applied` and never count as play;
 * `shapeProblems()` prints the shape test over the registered tree; `getUnlocked()` reads the
 * local player's researched nodes for specs.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { iconUrlOf } from '../../ui/vectorIcons'
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
