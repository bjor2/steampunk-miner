/**
 * The Outfitter's tab on the one base sheet (spec #678, ticket 687): the Upgrade bay's cards,
 * shown while the local player is docked there, since only there
 * does the authority take a buy. Named from Progression's vocabulary (`copy.places`).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { dockedBayOf } from '../../../systems/authority/dockRules'
import { DESIGN_TOKENS } from '../../../systems/views/designSystem'
import type { SheetTab } from '../../../ui/registries/sheetTabs'
import { OutfitterTabPanel } from './OutfitterTabPanel'

export const OUTFITTER_TAB_ID = 'workshop.outfitter'

/** Before the slices' tabs: the bay the rig is docked at reads first. */
const OUTFITTER_ORDER = 10

export const OUTFITTER_TAB: SheetTab = {
  id: OUTFITTER_TAB_ID,
  title: DESIGN_TOKENS.copy.places.outfitter,
  order: OUTFITTER_ORDER,
  isShownOn: isDockedAtUpgradeBay,
  Panel: OutfitterTabPanel,
}

function isDockedAtUpgradeBay(state: AuthorityState, playerId: string): boolean {
  return dockedBayOf(state, playerId) === 'upgrade'
}
