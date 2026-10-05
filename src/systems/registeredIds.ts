/**
 * Ids the scenario validator checks against (#11 section 4 and amendment 1). Each list belongs to
 * the decision that defines it and comes from that decision's data.
 */
import { ARTEFACT_IDS as ARTEFACT_OPTION_IDS } from './artefacts/artefactOptions'
import { ECONOMY } from './economy/economy'
import { PLANET_ARCHETYPES } from './world/planetTable'

/** The platform's facilities and visual states (#8 registered ids) and its bays (#37). */
export { FACILITY_IDS, PLATFORM_BAY_IDS, PLATFORM_VISUAL_STATES } from './authority/platformState'

/** The six upgrade tracks of #7, as `economy.json` defines them (#20). */
export const UPGRADE_IDS: readonly string[] = ECONOMY.upgrades.map((upgrade) => upgrade.id)

/** The enemy kinds of #9 (`crawler`, `burrower`), as `economy.json` defines them (#20). */
export const ENEMY_IDS: readonly string[] = ECONOMY.enemies.kinds.map((kind) => kind.id)

/** The planet archetypes of #10: `archetype.base` (planet 1) and `archetype.heavy` (planet 2). */
export const ARCHETYPE_IDS: readonly string[] = PLANET_ARCHETYPES.map(
  (archetype) => archetype.archetypeId,
)

/** The three artefact options of #46 (`ore_whisper`, `breathing_room`, `assay_beacon`). */
export const ARTEFACT_IDS: readonly string[] = ARTEFACT_OPTION_IDS
