/**
 * The Patent Office's tab on the one base sheet (spec #678, ticket 687): the tech tree, named from
 * Progression's vocabulary (`copy.places`), on the bar wherever the rig is, since research needs
 * no dock (the lab gate is the authority's refusal, said on the card).
 */
import { DESIGN_TOKENS } from '../../../systems/views/designSystem'
import type { SheetTab } from '../../../ui/registries/sheetTabs'
import { PatentOfficePanel } from './PatentOfficePanel'

export const PATENT_OFFICE_TAB_ID = 'tech-tree.patent-office'

/** After the bay the rig is docked at (the Outfitter's 10). */
const PATENT_OFFICE_ORDER = 20

export const PATENT_OFFICE_TAB: SheetTab = {
  id: PATENT_OFFICE_TAB_ID,
  title: DESIGN_TOKENS.copy.places.patentOffice,
  order: PATENT_OFFICE_ORDER,
  isShownOn: () => true,
  Panel: PatentOfficePanel,
}
