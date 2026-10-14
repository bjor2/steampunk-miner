/**
 * The Aetheric science lane's P16 fork (#261, the GD lock on #255 and build 3 of the lock on
 * #245): two exclusive branches on the kernel's fork shape (ticket 259), `tech.aetheric.fork.phase`
 * unlocking the phase lantern and `tech.aetheric.fork.arc` the galvanic arc coil. Both need the
 * lane's entry node, share one slot of the lane and so one `depthTerm` and `unlockTier`, so
 * `bandOrePriceAt` prices them alike on every planet and their Mark ladders step for step. The
 * branches drive differently (the phase crosses ground, the arc hits enemies), and each hangs
 * its own part on the vehicle through the tech-tree's gear rows.
 */
import { forkPairOf, type ForkBranchSpec, type ForkNode, type ForkPair } from '../../tech-tree'
import { ENTRY_NODE_ID } from './aethericNodes'
import { ARC_COIL_DESCRIPTION, ARC_COIL_ID, ARC_COIL_NAME, arcCoilMarkLadder } from './arcCoilItem'
import { LANTERN_DESCRIPTION, LANTERN_ID, LANTERN_NAME, lanternMarkLadder } from './lanternItem'

export const PHASE_BRANCH = 'phase'
export const ARC_BRANCH = 'arc'

const PHASE_BRANCH_SPEC: ForkBranchSpec = {
  branch: PHASE_BRANCH,
  iconId: 'node-aetheric-phase-lantern',
  name: LANTERN_NAME,
  prereqs: [ENTRY_NODE_ID],
  unlocks: LANTERN_ID,
  description: LANTERN_DESCRIPTION,
  label: 'horizontal',
  marks: lanternMarkLadder(),
}

const ARC_BRANCH_SPEC: ForkBranchSpec = {
  branch: ARC_BRANCH,
  iconId: 'node-aetheric-arc-coil',
  name: ARC_COIL_NAME,
  prereqs: [ENTRY_NODE_ID],
  unlocks: ARC_COIL_ID,
  description: ARC_COIL_DESCRIPTION,
  label: 'horizontal',
  marks: arcCoilMarkLadder(),
}

export const AETHERIC_FORK: ForkPair = forkPairOf('aetheric', [PHASE_BRANCH_SPEC, ARC_BRANCH_SPEC])

/** The two branch nodes as the slice registers them, `tech-node` content beside the lane's. */
export const AETHERIC_FORK_NODES: readonly ForkNode[] = AETHERIC_FORK.branches
