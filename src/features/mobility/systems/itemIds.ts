/**
 * The mobility lane's bare catalogue ids (#162 section 1, #224): one id per item, shared by its
 * `vehicle-item` row, its power-up entry, its tech node and its item card.
 */
export const MOBILITY_ITEM = {
  grappleWinch: 'power.grapple_winch',
  emergencyBallast: 'consumable.emergency_ballast',
  heatSinkFlask: 'consumable.heat_sink_flask',
  steamBoost: 'power.steam_boost',
  rivetPatch: 'consumable.rivet_patch',
  steamShield: 'power.steam_shield',
  smokeCanister: 'consumable.smoke_canister',
  gravAnchor: 'power.grav_anchor',
  buoyancyTanks: 'power.buoyancy_tanks',
  escapeThruster: 'consumable.escape_thruster',
} as const

export type MobilityItemId = (typeof MOBILITY_ITEM)[keyof typeof MOBILITY_ITEM]

/** The third cradle's id: `power-up-core` registers the item, this lane its node (#162). */
export const THIRD_CRADLE = 'slot.powerup_3'
