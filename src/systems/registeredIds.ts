/**
 * Ids the scenario validator checks against (#11 section 4 and amendment 1). Each list belongs to
 * the decision that defines it; the economy data (Build 3) replaces this list with its own
 * definitions when it lands.
 */

/** The six upgrade tracks of #7. */
export const UPGRADE_IDS: readonly string[] = [
  'drill_power',
  'drill_tip',
  'engine',
  'boiler',
  'cargo_hold',
  'hull',
]
