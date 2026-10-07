/**
 * The authored campaign tree of spec #161 section 1 and the combo templates of section 2, as
 * fixtures: the lane slices (#200-#206) register the real rows, so the tree's rules, the shape
 * test and the cost tables are proved on this copy until they land. Mark ladders take the #162
 * section 4.2 and 4.3 numbers where they exist; the rest are stand-ins of the same shape.
 *
 * The extraction lane's nodes are not copied: they are the `extraction` slice's own, so each has
 * one registrar (TD lock on #201 Q2). The slurry siphon's node is held with the siphon, so the
 * tree has 49 nodes.
 */
import { extractionTechNodes } from '../../extraction'
import type { DiscoveryRequirement, MarkLadder, TechComboTemplate, TechNode } from './techNode'

type Row = readonly [
  lane: TechNode['lane'],
  unlockTier: number,
  name: string,
  title: string,
  prereqs: readonly string[],
  unlocks: string,
  requiresDiscovery: DiscoveryRequirement | null,
]

// lane, P, node name, player-facing name, prereqs (short names), item, discovery.
const ROWS: readonly Row[] = [
  ['terrain', 3, 'stabiliser_foam', 'Stabiliser foam', [], 'consumable.stabiliser_foam', null],
  ['terrain', 6, 'ore_shifter', 'Magnetic ore-shifter', [], 'power.ore_shifter', null],
  [
    'terrain',
    10,
    'seam_splitter',
    'Seam splitter',
    ['terrain.ore_shifter'],
    'consumable.seam_splitter',
    null,
  ],
  [
    'terrain',
    14,
    'pressure_pocket',
    'Pressure pocket lance',
    ['terrain.seam_splitter'],
    'power.pressure_pocket',
    null,
  ],
  [
    'terrain',
    17,
    'cryo_binder',
    'Cryo binder',
    ['terrain.stabiliser_foam'],
    'consumable.cryo_binder',
    'hazard:frozen',
  ],
  [
    'terrain',
    20,
    'cradle_4',
    'Fourth power-up cradle',
    ['terrain.pressure_pocket'],
    'slot.powerup_4',
    null,
  ],
  [
    'terrain',
    23,
    'lodestone_beacon',
    'Lodestone beacon',
    ['terrain.ore_shifter'],
    'consumable.lodestone_beacon',
    null,
  ],
  [
    'terrain',
    29,
    'shoring_props',
    'Shoring props',
    ['terrain.cryo_binder'],
    'consumable.shoring_props',
    null,
  ],
  [
    'terrain',
    35,
    'strata_press',
    'Strata press',
    ['terrain.shoring_props'],
    'power.strata_press',
    null,
  ],
  ['sensing', 2, 'echo_sounder', 'Echo sounder', [], 'power.echo_sounder', null],
  [
    'sensing',
    5,
    'threat_periscope',
    'Threat periscope',
    ['sensing.echo_sounder'],
    'passive.threat_periscope',
    'enemy:tunnel_wrecker',
  ],
  ['sensing', 7, 'assay_lens', 'Assay lens', ['sensing.echo_sounder'], 'passive.assay_lens', null],
  [
    'sensing',
    7,
    'hazard_barometer',
    'Hazard barometer',
    ['sensing.assay_lens'],
    'passive.hazard_barometer',
    'hazard:heat_lava',
  ],
  [
    'sensing',
    13,
    'flare_mortar',
    'Survey flare mortar',
    ['sensing.echo_sounder'],
    'consumable.flare_mortar',
    null,
  ],
  [
    'sensing',
    21,
    'signal_buoy',
    'Signal buoy',
    ['sensing.flare_mortar'],
    'consumable.signal_buoy',
    null,
  ],
  [
    'sensing',
    26,
    'galvanic_probe',
    'Galvanic probe',
    ['sensing.hazard_barometer'],
    'power.galvanic_probe',
    'hazard:magnetic',
  ],
  [
    'sensing',
    30,
    'cradle_5',
    'Fifth power-up cradle',
    ['sensing.signal_buoy'],
    'slot.powerup_5',
    null,
  ],
  [
    'sensing',
    33,
    'void_sounder',
    'Void sounder',
    ['sensing.galvanic_probe'],
    'power.void_sounder',
    'hazard:hollow',
  ],
  ['mobility', 3, 'grapple_winch', 'Grapple winch', [], 'power.grapple_winch', null],
  [
    'mobility',
    5,
    'emergency_ballast',
    'Emergency ballast',
    ['mobility.grapple_winch'],
    'consumable.emergency_ballast',
    null,
  ],
  [
    'mobility',
    9,
    'heat_sink_flask',
    'Heat sink flask',
    ['mobility.emergency_ballast'],
    'consumable.heat_sink_flask',
    null,
  ],
  [
    'mobility',
    10,
    'cradle_3',
    'Third power-up cradle',
    ['mobility.grapple_winch'],
    'slot.powerup_3',
    null,
  ],
  [
    'mobility',
    12,
    'steam_boost',
    'Steam boost',
    ['mobility.emergency_ballast'],
    'power.steam_boost',
    null,
  ],
  [
    'mobility',
    16,
    'rivet_patch',
    'Rivet patch kit',
    ['mobility.steam_boost'],
    'consumable.rivet_patch',
    null,
  ],
  [
    'mobility',
    22,
    'steam_shield',
    'Steam shield',
    ['mobility.rivet_patch'],
    'power.steam_shield',
    null,
  ],
  [
    'mobility',
    27,
    'smoke_canister',
    'Smoke canister',
    ['mobility.steam_shield'],
    'consumable.smoke_canister',
    null,
  ],
  [
    'mobility',
    32,
    'grav_anchor',
    'Grav anchor',
    ['mobility.steam_boost'],
    'power.grav_anchor',
    null,
  ],
  [
    'mobility',
    34,
    'buoyancy_tanks',
    'Buoyancy tanks',
    ['mobility.grav_anchor'],
    'power.buoyancy_tanks',
    null,
  ],
  [
    'mobility',
    37,
    'escape_thruster',
    'Escape thruster',
    ['mobility.buoyancy_tanks'],
    'consumable.escape_thruster',
    null,
  ],
  ['drill-gear', 4, 'vibratory_bit', 'Vibratory bit', [], 'gear.vibratory_bit', null],
  [
    'drill-gear',
    8,
    'spoil_auger',
    'Spoil auger',
    ['drill-gear.vibratory_bit'],
    'gear.spoil_auger',
    null,
  ],
  [
    'drill-gear',
    13,
    'side_cutters',
    'Side cutters',
    ['drill-gear.vibratory_bit'],
    'gear.side_cutters',
    null,
  ],
  [
    'drill-gear',
    17,
    'thaw_crown',
    'Thaw crown',
    ['drill-gear.vibratory_bit'],
    'gear.thaw_crown',
    'hazard:frozen',
  ],
  [
    'drill-gear',
    19,
    'twin_bit',
    'Twin-bit head',
    ['drill-gear.vibratory_bit'],
    'gear.twin_bit',
    null,
  ],
  [
    'drill-gear',
    24,
    'sampling_corer',
    'Sampling corer',
    ['drill-gear.spoil_auger'],
    'gear.sampling_corer',
    null,
  ],
  [
    'drill-gear',
    27,
    'dielectric_bit',
    'Dielectric bit',
    ['drill-gear.twin_bit'],
    'gear.dielectric_bit',
    'hazard:magnetic',
  ],
  [
    'drill-gear',
    34,
    'reach_boom',
    'Reach boom',
    ['drill-gear.sampling_corer'],
    'gear.reach_boom',
    null,
  ],
  [
    'combo',
    15,
    'assay_drain',
    'Assay drain',
    ['sensing.assay_lens', 'extraction.mineral_drain'],
    'combo.assay_drain',
    null,
  ],
  [
    'combo',
    18,
    'magnetic_survey',
    'Magnetic survey',
    ['sensing.echo_sounder', 'terrain.ore_shifter'],
    'combo.magnetic_survey',
    null,
  ],
  [
    'combo',
    21,
    'foam_cutters',
    'Foam cutters',
    ['terrain.stabiliser_foam', 'drill-gear.side_cutters'],
    'combo.foam_cutters',
    null,
  ],
  [
    'combo',
    24,
    'alarm_shield',
    'Alarm shield',
    ['sensing.threat_periscope', 'mobility.steam_shield'],
    'combo.alarm_shield',
    null,
  ],
  [
    'combo',
    28,
    'cored_drain',
    'Cored drain',
    ['drill-gear.sampling_corer', 'extraction.mineral_drain'],
    'combo.cored_drain',
    null,
  ],
  [
    'combo',
    36,
    'ceiling_anchor',
    'Ceiling anchor',
    ['mobility.grav_anchor', 'drill-gear.twin_bit'],
    'combo.ceiling_anchor',
    null,
  ],
]

/** #162 section 4.2 and 4.3 ladders (cooldown ticks, magnitude, charges or stack). */
const KNOWN_LADDERS: Readonly<Record<string, MarkLadder>> = {
  'power.echo_sounder': {
    isIncomeItem: false,
    cooldown: 300,
    magnitude: { base: 600 },
    charges: 3,
  },
  'power.grapple_winch': { isIncomeItem: false, cooldown: 120, magnitude: { base: 8 }, charges: 4 },
  'power.ore_shifter': {
    isIncomeItem: true,
    cooldown: 600,
    magnitude: { base: 8, limit: 64 },
    charges: 2,
  },
  'power.steam_boost': { isIncomeItem: false, cooldown: 240, magnitude: { base: 30 }, charges: 3 },
  'power.pressure_pocket': {
    isIncomeItem: true,
    cooldown: 480,
    magnitude: { base: 2 },
    charges: 2,
  },
  'power.steam_shield': {
    isIncomeItem: false,
    cooldown: 900,
    magnitude: { base: 120 },
    charges: 2,
  },
  'consumable.stabiliser_foam': {
    isIncomeItem: false,
    magnitude: { base: 16, limit: 32 },
    charges: 4,
  },
  'consumable.seam_splitter': { isIncomeItem: true, magnitude: { base: 8, limit: 32 }, charges: 3 },
  'consumable.lodestone_beacon': { isIncomeItem: true, magnitude: { base: 10 }, charges: 1 },
}

/** The Schedule C rows these nodes absorb (#161 section 1 row-to-node map). */
const CLAIMED_ROWS: Readonly<Record<string, string>> = {
  'tech.drill_gear.side_cutters': 'side_drills',
  'tech.mobility.steam_shield': 'shields',
  'tech.mobility.grav_anchor': 'grav_anchor',
  'tech.mobility.buoyancy_tanks': 'buoyancy_tanks',
  'tech.mobility.escape_thruster': 'escape_thrusters',
}

const STAND_IN_LADDER: MarkLadder = { isIncomeItem: false, cooldown: 300, magnitude: { base: 12 } }

const MARK_BEARING_ITEM = /^(power|consumable|passive|gear)\./

/** The 49 authored nodes, ids `tech.<lane>.<name>` as #161 writes them (lane in snake case, #224). */
export const AUTHORED_TREE_FIXTURE: readonly TechNode[] = [
  ...extractionTechNodes(),
  ...ROWS.map(nodeOfRow),
]

/** The ten lane-pair templates: the six authored combos and the four #161 adds. */
export const COMBO_TEMPLATES_FIXTURE: readonly TechComboTemplate[] = [
  template(
    'assay_drain',
    ['sensing', 'extraction'],
    'sensing.assay_lens',
    'extraction.mineral_drain',
  ),
  template(
    'magnetic_survey',
    ['sensing', 'terrain'],
    'sensing.echo_sounder',
    'terrain.ore_shifter',
  ),
  template(
    'foam_cutters',
    ['terrain', 'drill-gear'],
    'terrain.stabiliser_foam',
    'drill-gear.side_cutters',
  ),
  template(
    'alarm_shield',
    ['sensing', 'mobility'],
    'sensing.threat_periscope',
    'mobility.steam_shield',
  ),
  template(
    'cored_drain',
    ['drill-gear', 'extraction'],
    'drill-gear.sampling_corer',
    'extraction.mineral_drain',
  ),
  template(
    'ceiling_anchor',
    ['mobility', 'drill-gear'],
    'mobility.grav_anchor',
    'drill-gear.twin_bit',
  ),
  template(
    'lodestone_drain',
    ['extraction', 'terrain'],
    'extraction.mineral_drain',
    'terrain.lodestone_beacon',
  ),
  template(
    'lens_corer',
    ['sensing', 'drill-gear'],
    'sensing.assay_lens',
    'drill-gear.sampling_corer',
  ),
  template(
    'foam_grapple',
    ['terrain', 'mobility'],
    'terrain.stabiliser_foam',
    'mobility.grapple_winch',
  ),
  template(
    'aether_reel',
    ['extraction', 'mobility'],
    'extraction.aether_tether',
    'mobility.grapple_winch',
  ),
]

function nodeOfRow([lane, unlockTier, name, title, prereqs, unlocks, discovery]: Row): TechNode {
  const id = nodeIdOf(`${lane}.${name}`)
  const isSlot = unlocks.startsWith('slot.')
  return {
    id,
    iconId: `node-${lane}-${name.replaceAll('_', '-')}`,
    lane,
    name: title,
    unlockTier,
    prereqs: prereqs.map(nodeIdOf),
    ...(discovery !== null && { requiresDiscovery: discovery }),
    unlocks,
    description: `${title}, as the Guild's engineers drew it.`,
    label: isSlot ? 'both' : 'horizontal',
    costKind: lane === 'combo' ? 'combo' : isSlot ? 'slot' : 'capability',
    ...(id in CLAIMED_ROWS && { scheduleRowId: CLAIMED_ROWS[id] }),
    ...(MARK_BEARING_ITEM.test(unlocks) && { marks: KNOWN_LADDERS[unlocks] ?? STAND_IN_LADDER }),
  }
}

/**
 * `tech.<lane>.<name>` from `<lane>.<name>`, the lane in snake case: the #224 bare-id rule refuses
 * the hyphen of `drill-gear` (#205 GD lock: `tech.drill_gear.*`).
 */
function nodeIdOf(short: string): string {
  return `tech.${short.replace('-', '_')}`
}

function template(
  name: string,
  lanes: TechComboTemplate['lanes'],
  firstParent: string,
  secondParent: string,
): TechComboTemplate {
  return {
    id: `tech.template.${name}`,
    iconId: `node-combo-${name.replaceAll('_', '-')}`,
    lanes,
    name: name.replaceAll('_', ' '),
    unlocks: `combo.${name}`,
    parents: [nodeIdOf(firstParent), nodeIdOf(secondParent)],
    description: `The ${name.replaceAll('_', ' ')}, graded again at the research lab.`,
  }
}
