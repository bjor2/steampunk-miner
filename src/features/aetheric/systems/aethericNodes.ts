/**
 * The Aetheric science lane's nodes (GD lock on #245, ticket 260): the entry node on P15,
 * researched at the `research_lab` and refused `no_lab` before it stands, and two shared lane
 * nodes on P24 and P29 that need only the entry node, so a P16 fork re-choice (#255) strands
 * neither. Every item adds a verb and spends energy or heat, never yield; the items, their Mark
 * ladders and their numbers come with their own builds (#262, #263), the P16 fork pair with #261.
 */
import type { TechNode } from '../../tech-tree'

const ENTRY_NODE_ID = 'tech.aetheric.resonance_whistle'

export const AETHERIC_TECH_NODES: readonly TechNode[] = [
  {
    id: ENTRY_NODE_ID,
    iconId: 'node-aetheric-resonance-whistle',
    lane: 'aetheric',
    name: 'Resonance whistle',
    unlockTier: 15,
    prereqs: [],
    researchedAt: 'research_lab',
    unlocks: 'power.resonance_whistle',
    description: 'A brass whistle on the boiler stack sings a note that calls enemies away.',
    label: 'horizontal',
    costKind: 'capability',
  },
  {
    id: 'tech.aetheric.chronometric_governor',
    iconId: 'node-aetheric-chronometric-governor',
    lane: 'aetheric',
    name: 'Chronometric governor',
    unlockTier: 24,
    prereqs: [ENTRY_NODE_ID],
    unlocks: 'power.chronometric_governor',
    description: 'An escapement cage slows the clockwork of every enemy caught near it.',
    label: 'horizontal',
    costKind: 'capability',
  },
  {
    id: 'tech.aetheric.aether_condenser',
    iconId: 'node-aetheric-aether-condenser',
    lane: 'aetheric',
    name: 'Aether condenser',
    unlockTier: 29,
    prereqs: [ENTRY_NODE_ID],
    unlocks: 'power.aether_condenser',
    description: "A flank tank condenses the boiler's spare heat back into stored charge.",
    label: 'horizontal',
    costKind: 'capability',
  },
]
