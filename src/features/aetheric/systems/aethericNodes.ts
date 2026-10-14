/**
 * The Aetheric science lane's nodes (GD lock on #245, ticket 260): the entry node on P15,
 * researched at the `research_lab` and refused `no_lab` before it stands, and two shared lane
 * nodes on P24 and P29 that need only the entry node, so a P16 fork re-choice (#255) strands
 * neither. Every item adds a verb and spends energy or heat, never yield; the items, their Mark
 * ladders and their numbers come with their own builds: the whistle's with #262, the governor's
 * and the condenser's with #263, the P16 fork pair with #261.
 */
import type { TechNode } from '../../tech-tree'
import {
  CONDENSER_DESCRIPTION,
  CONDENSER_ID,
  CONDENSER_NAME,
  CONDENSER_UNLOCK_PLANET,
  condenserMarkLadder,
} from './condenserItem'
import {
  GOVERNOR_DESCRIPTION,
  GOVERNOR_ID,
  GOVERNOR_NAME,
  GOVERNOR_UNLOCK_PLANET,
  governorMarkLadder,
} from './governorItem'
import {
  WHISTLE_DESCRIPTION,
  WHISTLE_ID,
  WHISTLE_NAME,
  WHISTLE_UNLOCK_PLANET,
  whistleMarkLadder,
} from './whistleItem'

const ENTRY_NODE_ID = 'tech.aetheric.resonance_whistle'

export const AETHERIC_TECH_NODES: readonly TechNode[] = [
  {
    id: ENTRY_NODE_ID,
    iconId: 'node-aetheric-resonance-whistle',
    lane: 'aetheric',
    name: WHISTLE_NAME,
    unlockTier: WHISTLE_UNLOCK_PLANET,
    prereqs: [],
    researchedAt: 'research_lab',
    unlocks: WHISTLE_ID,
    description: WHISTLE_DESCRIPTION,
    label: 'horizontal',
    costKind: 'capability',
    marks: whistleMarkLadder(),
  },
  {
    id: 'tech.aetheric.chronometric_governor',
    iconId: 'node-aetheric-chronometric-governor',
    lane: 'aetheric',
    name: GOVERNOR_NAME,
    unlockTier: GOVERNOR_UNLOCK_PLANET,
    prereqs: [ENTRY_NODE_ID],
    unlocks: GOVERNOR_ID,
    description: GOVERNOR_DESCRIPTION,
    label: 'horizontal',
    costKind: 'capability',
    marks: governorMarkLadder(),
  },
  {
    id: 'tech.aetheric.aether_condenser',
    iconId: 'node-aetheric-aether-condenser',
    lane: 'aetheric',
    name: CONDENSER_NAME,
    unlockTier: CONDENSER_UNLOCK_PLANET,
    prereqs: [ENTRY_NODE_ID],
    unlocks: CONDENSER_ID,
    description: CONDENSER_DESCRIPTION,
    label: 'horizontal',
    costKind: 'capability',
    marks: condenserMarkLadder(),
  },
]
