/**
 * The shipped rig look table (#577): `rigLook.json`, checked when it loads. A bad row throws with
 * every problem listed, so a broken table fails its specs and the game's start, never a frame.
 */
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import RIG_LOOK_FILE from '../rigLook.json'
import { rigLookTableProblemsOf, type RigLookTable } from './rigLookTableChecks'

export class RigLookTableError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`rigLook.json: ${problems.join('; ')}`)
    this.name = 'RigLookTableError'
  }
}

/** `table` once it passes every check; a new track needs only its id in `knownTracks`. */
export function readRigLookTable(
  table: RigLookTable,
  knownTracks: readonly string[] = UPGRADE_IDS,
): RigLookTable {
  const problems = rigLookTableProblemsOf(table, knownTracks)
  if (problems.length > 0) throw new RigLookTableError(problems)
  return table
}

export const RIG_LOOK_TABLE: RigLookTable = readRigLookTable(RIG_LOOK_FILE)
