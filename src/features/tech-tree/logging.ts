/**
 * The tree's run-log lines (spec #161 section 5, logging from the start, design 37.5): every
 * research is `tech-tree.tech_node_unlocked` with what it cost, so the spend-share analysis is
 * derived from the log; every refusal is `tech-tree.tech_node_refused`. The debug grant logs only
 * the kernel's `debug_command_applied`, so it never counts as play.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import { TECH_LANES } from './systems/techNode'
import { TECH_NODE_REFUSALS } from './systems/unlockRules'

export const TECH_TREE_PROJECTIONS: SliceEventProjections = {
  'tech-tree.TechNodeUnlocked': ({ nodeId, lane, kind, mark, cost }) => ({
    event: 'tech-tree.tech_node_unlocked',
    data: { nodeId, lane, kind, mark, cost },
  }),
  'tech-tree.TechNodeRefused': ({ nodeId, reason }) => ({
    event: 'tech-tree.tech_node_refused',
    data: { nodeId, reason },
  }),
  'tech-tree.TechNodesGranted': () => null,
}

export const TECH_TREE_RUN_EVENTS: SliceRunEvents = {
  'tech-tree.tech_node_unlocked': {
    group: 'progression',
    level: 'core',
    payload: {
      nodeId: 'text',
      lane: { oneOf: [...TECH_LANES, 'combo'] },
      kind: { oneOf: ['capability', 'mark', 'combo'] },
      mark: 'integer',
      cost: 'money',
    },
  },
  'tech-tree.tech_node_refused': {
    group: 'progression',
    level: 'core',
    payload: { nodeId: 'text', reason: { oneOf: TECH_NODE_REFUSALS } },
  },
}
