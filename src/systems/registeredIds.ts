/**
 * Ids the scenario validator checks against (#11 section 4 and amendment 1). Each list belongs to
 * the decision that defines it and comes from that decision's data.
 */
import { ECONOMY } from './economy/economy'

/** The platform's facilities and visual states (#8 registered ids). */
export { FACILITY_IDS, PLATFORM_VISUAL_STATES } from './authority/platformState'

/** The six upgrade tracks of #7, as `economy.json` defines them (#20). */
export const UPGRADE_IDS: readonly string[] = ECONOMY.upgrades.map((upgrade) => upgrade.id)
