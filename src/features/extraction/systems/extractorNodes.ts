/**
 * The extraction lane's extractor nodes (#161 section 1, the TD lock on #201 Q2): one capability
 * node per extractor, `tech.extraction.<name>`, each unlocking its `rig.*` row by id. The
 * extractors, their names, flavour lines and gate classes are `mining-gates`' rows; this slice only
 * places each in the tree, so a node is registered once, here.
 *
 * `requiresDiscovery: class:<gateClass>` is #161's shorthand for `{anyOf: [ore:<family> …]}` over
 * the families in that gate class, resolved from `planet-mix`'s family rows when the slice
 * registers, so re-keying the families changes no tree data. Extractors have no Marks and no
 * prerequisites (#161).
 */
import { familyRows } from '../../planet-mix'
import { GATE_ROWS, type Rig } from '../../mining-gates'
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import type { TechNode } from '../../tech-tree'

/** #161 section 1: each node opens the planet before its extractor arrives (#142, `5 + 7k`). */
const UNLOCK_TIER_BY_RIG: Readonly<Record<string, number>> = {
  'rig.resonance': 4,
  'rig.containment': 11,
  'rig.acid_etcher': 18,
  'rig.induction': 25,
  'rig.aether_tether': 32,
}

/** The five extractor nodes, in arrival order. */
export function extractorNodes(): TechNode[] {
  return GATE_ROWS.rigs.map(extractorNodeOf)
}

function extractorNodeOf(rig: Rig): TechNode {
  return {
    id: rig.unlockedBy,
    iconId: nodeIconIdOf(rig.unlockedBy),
    lane: 'extraction',
    name: rig.name,
    unlockTier: unlockTierOf(rig),
    prereqs: [],
    requiresDiscovery: { anyOf: oreKeysOfGateClass(rig.gateClass) },
    unlocks: rig.id,
    description: rig.description,
    label: 'horizontal',
    costKind: 'capability',
  }
}

function unlockTierOf(rig: Rig): number {
  const tier = UNLOCK_TIER_BY_RIG[rig.id]
  if (tier === undefined) throw new RangeError(`#161 places no node for ${rig.id}`)
  return tier
}

/** `tech.extraction.resonance_fork` → `node-extraction-resonance-fork` (#158). */
export function nodeIconIdOf(nodeId: string): string {
  return `node-${nodeId.replace(/^tech\./, '').replace(/[._]/g, '-')}`
}

/** `ore:<family>` for every family whose gate class is `gateClass`, in cell-code order. */
export function oreKeysOfGateClass(gateClass: string): DiscoveryKey[] {
  return familyRows()
    .filter((row) => row.gateClass === gateClass)
    .map((row): DiscoveryKey => `ore:${row.id}`)
}
