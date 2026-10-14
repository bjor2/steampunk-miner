/**
 * The tree's run-log lines (spec #161 section 5, logging from the start, design 37.5): every
 * research is `tech-tree.tech_node_unlocked` with what it cost, so the spend-share analysis is
 * derived from the log; every refusal is `tech-tree.tech_node_refused`. A lane's fork choice is
 * `tech-tree.fork_chosen`, a switch at the platform `tech-tree.fork_rechosen`, each with its cost,
 * and a refused one `tech-tree.fork_refused` (#255). The debug grant logs only the kernel's
 * `debug_command_applied`, so it never counts as play. A refusal's reason may still be one #411
 * retired (the planet, discovery and lab locks): logs written before it carry them.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import { FORK_REFUSALS } from './systems/forkRules'
import { ARMOURY_LANES, TECH_LANES } from './systems/techNode'
import { RETIRED_TECH_NODE_REFUSALS, TECH_NODE_REFUSALS } from './systems/unlockRules'

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
  'tech-tree.ForkChosen': ({ lane, branch, cost }) => ({
    event: 'tech-tree.fork_chosen',
    data: { lane, branch, cost },
  }),
  'tech-tree.ForkRechosen': ({ lane, from, to, cost }) => ({
    event: 'tech-tree.fork_rechosen',
    data: { lane, from, to, cost },
  }),
  'tech-tree.ForkRefused': ({ lane, branch, reason }) => ({
    event: 'tech-tree.fork_refused',
    data: { lane, branch, reason },
  }),
}

export const TECH_TREE_RUN_EVENTS: SliceRunEvents = {
  'tech-tree.tech_node_unlocked': {
    group: 'progression',
    level: 'core',
    payload: {
      nodeId: 'text',
      lane: { oneOf: [...TECH_LANES, 'combo', ...ARMOURY_LANES] },
      kind: { oneOf: ['capability', 'mark', 'combo'] },
      mark: 'integer',
      cost: 'money',
    },
  },
  'tech-tree.tech_node_refused': {
    group: 'progression',
    level: 'core',
    payload: {
      nodeId: 'text',
      reason: { oneOf: [...TECH_NODE_REFUSALS, ...RETIRED_TECH_NODE_REFUSALS] },
    },
  },
  'tech-tree.fork_chosen': {
    group: 'progression',
    level: 'core',
    payload: { lane: { oneOf: TECH_LANES }, branch: 'text', cost: 'money' },
  },
  'tech-tree.fork_rechosen': {
    group: 'progression',
    level: 'core',
    payload: { lane: { oneOf: TECH_LANES }, from: 'text', to: 'text', cost: 'money' },
  },
  'tech-tree.fork_refused': {
    group: 'progression',
    level: 'core',
    payload: {
      lane: 'text',
      branch: 'text',
      reason: { oneOf: [...FORK_REFUSALS, ...RETIRED_TECH_NODE_REFUSALS] },
    },
  },
}
