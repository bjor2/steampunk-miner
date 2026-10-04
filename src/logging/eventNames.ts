/**
 * The events worth logging, exactly as listed in design doc section 22, grouped as it groups
 * them. `debug_command_applied` is ours: scenario/debug commands change state without play, so
 * derived analytics (section 27) must be able to tell a granted 1e100 from earned money.
 *
 * Section 22 note: raw per-tile events can be too large for analytics; if so, `tile_drilled` and
 * `tile_destroyed` become debug-only and production logs aggregate mining intervals.
 */
export const RUN_EVENT_NAMES_BY_GROUP = {
  progression: [
    'game_started',
    'game_ended',
    'planet_unlocked',
    'planet_entered',
    'planet_completed',
    'core_reached',
    'core_tile_harvested',
    'core_completed',
    'facility_unlocked',
    'facility_upgraded',
    'feature_unlocked',
    'quest_started',
    'quest_completed',
  ],
  economy: [
    'resource_collected',
    'resource_sold',
    'resource_processed',
    'purchase_made',
    'upgrade_purchased',
    'repair_purchased',
    'money_earned',
    'money_spent',
    'core_material_earned',
    'core_material_spent',
  ],
  mining: [
    'tile_drilled',
    'tile_destroyed',
    'drill_damage_dealt',
    'depth_milestone_reached',
    'cave_discovered',
    'rare_resource_discovered',
    'mining_session_started',
    'mining_session_ended',
  ],
  vehicle: [
    'vehicle_damaged',
    'vehicle_destroyed',
    'vehicle_repaired',
    'energy_depleted',
    'storage_full',
    'module_installed',
    'module_removed',
    'wagon_added',
    'weapon_added',
    'vehicle_configuration_changed',
  ],
  combat: [
    'enemy_spawned',
    'enemy_damaged',
    'enemy_killed',
    'player_damaged',
    'player_killed',
    'weapon_fired',
    'enemy_type_encountered',
    'boss_started',
    'boss_defeated',
  ],
  world: [
    'planet_event_triggered',
    'hazard_encountered',
    'landmark_discovered',
    'npc_encountered',
    'story_event_triggered',
  ],
  multiplayer: [
    'player_joined',
    'player_left',
    'player_revived',
    'shared_resource_transfer',
    'cooperative_core_harvest',
    'multiplayer_desync_detected',
    'host_migration',
    'network_interruption',
  ],
  debug: ['debug_command_applied'],
} as const

export type RunEventGroup = keyof typeof RUN_EVENT_NAMES_BY_GROUP

export type RunEventName = (typeof RUN_EVENT_NAMES_BY_GROUP)[RunEventGroup][number]

export const ALL_RUN_EVENT_NAMES: readonly RunEventName[] =
  Object.values(RUN_EVENT_NAMES_BY_GROUP).flat()
