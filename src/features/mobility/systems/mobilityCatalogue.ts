/**
 * The mobility and survival lane (spec #162 section 1, "Mobility & survival"): each item's
 * catalogue row and its `tech.mobility.*` node (#161 section 1: planets, and the prerequisites the
 * #165 tree fixture carries). Names and flavour lines are #162's, under the naming rule: the item
 * text calls the vehicle "the miner".
 *
 * Icons are shipped stand-ins until the Blender pipeline draws `item-*` and `node-*` (GD lock on
 * #204 Q8). The heat sink flask's node waits on refractory lining, the passive answer to heat
 * (#162 acceptance 8, Q4 b). Four nodes absorb Schedule C rows (#161, `scheduleAbsorber.ts`).
 */
import type { ItemAttach } from '../../../systems/registries/vehicleAttach'
import { MOBILITY_ITEM, THIRD_CRADLE } from './itemIds'

export interface MobilityRow {
  /** The bare catalogue id the node unlocks. */
  itemId: string
  name: string
  /** `tech.mobility.<node>`. */
  node: string
  /** The planet the node can first be researched on. */
  unlockTier: number
  /** Short node names in this lane. */
  prereqs: readonly string[]
  /** No digits, at most 80 characters (#159). */
  flavour: string
  iconId: string
  /** The vehicle-attach point it is drawn at; null for the cradle, which `power-up-core` owns. */
  attach: ItemAttach | null
  requiresOwned?: readonly string[]
  scheduleRowId?: string
}

/** The lining module the flask waits on (`ownedRequirement.ts` in `tech-tree`). */
const REFRACTORY_LINING = 'refractory_lining'

const ICON = {
  slots: 'icon-panel-slots',
  rack: 'icon-charge-rack',
  repair: 'icon-repair',
  lining: 'icon-refractory-lining',
  hull: 'icon-gauge-hull',
} as const

export const MOBILITY_ROWS: readonly MobilityRow[] = [
  {
    itemId: MOBILITY_ITEM.grappleWinch,
    name: 'Grapple winch',
    node: 'grapple_winch',
    unlockTier: 3,
    prereqs: [],
    flavour: 'A spring-fired grapple bites the shaft wall and a steam winch hauls.',
    iconId: ICON.slots,
    attach: 'hull.arm.right',
  },
  {
    itemId: MOBILITY_ITEM.emergencyBallast,
    name: 'Emergency ballast',
    node: 'emergency_ballast',
    unlockTier: 5,
    prereqs: ['grapple_winch'],
    flavour: 'Drop the lead ballast and a tired boiler can still lift you home.',
    iconId: ICON.rack,
    attach: 'hull.rear',
  },
  {
    itemId: MOBILITY_ITEM.heatSinkFlask,
    name: 'Heat sink flask',
    node: 'heat_sink_flask',
    unlockTier: 9,
    prereqs: ['emergency_ballast'],
    flavour: 'A flask of chilled salt soaks up boiler heat until you vent it topside.',
    iconId: ICON.lining,
    attach: 'hull.rear',
    requiresOwned: [REFRACTORY_LINING],
  },
  {
    itemId: THIRD_CRADLE,
    name: 'Third power-up cradle',
    node: 'cradle_3',
    unlockTier: 10,
    prereqs: ['grapple_winch'],
    flavour: 'A third sprung cradle on the deck for one more gadget below.',
    iconId: ICON.slots,
    attach: null,
  },
  {
    itemId: MOBILITY_ITEM.steamBoost,
    name: 'Steam boost',
    node: 'steam_boost',
    unlockTier: 12,
    prereqs: ['emergency_ballast'],
    flavour: 'A blow-off valve dumps the whole boiler into one roaring shove.',
    iconId: ICON.slots,
    attach: 'slot',
  },
  {
    itemId: MOBILITY_ITEM.rivetPatch,
    name: 'Rivet patch kit',
    node: 'rivet_patch',
    unlockTier: 16,
    prereqs: ['steam_boost'],
    flavour: 'Hot rivets and a boiler plate slapped over the worst of the damage.',
    iconId: ICON.repair,
    attach: 'hull.rear',
  },
  {
    itemId: MOBILITY_ITEM.steamShield,
    name: 'Steam shield',
    node: 'steam_shield',
    unlockTier: 22,
    prereqs: ['rivet_patch'],
    flavour: 'A curtain of superheated steam turns aside claws and falling rock.',
    iconId: ICON.hull,
    attach: 'slot',
    scheduleRowId: 'shields',
  },
  {
    itemId: MOBILITY_ITEM.smokeCanister,
    name: 'Smoke canister',
    node: 'smoke_canister',
    unlockTier: 27,
    prereqs: ['steam_shield'],
    flavour: 'Choking coal smoke that blinds anything hunting by sight or tremor.',
    iconId: ICON.rack,
    attach: 'hull.rear',
  },
  {
    itemId: MOBILITY_ITEM.gravAnchor,
    name: 'Grav anchor',
    node: 'grav_anchor',
    unlockTier: 32,
    prereqs: ['steam_boost'],
    flavour: 'A spinning gyro mass pins the miner to whatever surface it presses.',
    iconId: ICON.slots,
    attach: 'slot',
    scheduleRowId: 'grav_anchor',
  },
  {
    itemId: MOBILITY_ITEM.buoyancyTanks,
    name: 'Buoyancy tanks',
    node: 'buoyancy_tanks',
    unlockTier: 34,
    prereqs: ['grav_anchor'],
    flavour: 'Hot-air bladders hold the miner steady in open cavern air.',
    iconId: ICON.slots,
    attach: 'slot',
    scheduleRowId: 'buoyancy_tanks',
  },
  {
    itemId: MOBILITY_ITEM.escapeThruster,
    name: 'Escape thruster',
    node: 'escape_thruster',
    unlockTier: 37,
    prereqs: ['buoyancy_tanks'],
    flavour: 'A powder cartridge that kicks the miner up the shaft in one burst.',
    iconId: ICON.rack,
    attach: 'hull.rear',
    scheduleRowId: 'escape_thrusters',
  },
]

/** The rows of the items this lane owns: every row but the cradle's. */
export const MOBILITY_ITEM_ROWS: readonly MobilityRow[] = MOBILITY_ROWS.filter(
  (row) => row.attach !== null,
)

export function mobilityRowOf(itemId: string): MobilityRow | null {
  return MOBILITY_ROWS.find((row) => row.itemId === itemId) ?? null
}
