/**
 * D5 #864: `blastBit`, the drill node that replaces the HS's `drillGate`. A money-only tech node
 * under `blasting_charges` (no stats id), on the tree's node curve in the drill-gear lane, priced
 * on the planet D6 #865 anchors it at (`nodePriceAnchors.blastBit` in economy.json, P8 of its
 * P8-P10 band). Research waits only on money: no planet, no cap. A tree-only capability,
 * as the fork branches are: no store item, no slot. Owned, the drill grinds blast-only rock at
 * `dynamiteGate.blastBitSpeedBp` of its speed instead of stopping (`mining-gates` `canMine`).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { blastBitPriceAnchor } from '../../../systems/economy/blastingCharges'
import { isUnlocked, type TechNode } from '../../tech-tree'

export const BLAST_BIT_NODE_ID = 'tech.dynamite.blast_bit'

/** The capability the node names; nothing sells or slots it. */
const BLAST_BIT_ITEM_ID = 'dynamite.blast_bit'

/** The schedule row the dynamite ladder ships under, the node's anchor row (HS: no stats id). */
const BLASTING_CHARGES_ROW_ID = 'blasting_charges'

export const BLAST_BIT_NODE: TechNode = {
  id: BLAST_BIT_NODE_ID,
  // The drill-power track's icon, as the drill-gear fork's Wide, until art draws the bit.
  iconId: 'icon-track-drill-power',
  lane: 'drill-gear',
  name: 'Blast bit',
  unlockTier: blastBitPriceAnchor(),
  prereqs: [],
  requiresFeature: [BLASTING_CHARGES_ROW_ID],
  unlocks: BLAST_BIT_ITEM_ID,
  description: 'A carbide bit that grinds slowly through blast-only rock, no charge needed.',
  label: 'horizontal',
  costKind: 'capability',
}

/** Whether the player researched the blast bit. */
export function ownsBlastBit(state: AuthorityState, playerId: string): boolean {
  return isUnlocked(state, playerId, BLAST_BIT_NODE_ID)
}
