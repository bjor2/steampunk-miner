/**
 * The milestone combos (spec #162 section 1, the milestone combos table; #161 sections 1 and 2;
 * ticket 206 "Combo templates"): one row per combo store item and one `tech-combo-template` row
 * per lane pair. Six combos are authored nodes researched at the `research_lab` (P15 onward);
 * the four templates Content added on 7 Oct are endless only, first seen as a generated combo
 * from P41, and so are the five aetheric pairs Content wrote on ticket 373 (the GD ruling of 14
 * Oct: one per other lane, the aetheric parent first). The ceiling anchor (#288) is the last
 * authored one, at P36, once the twin bit's diagonal (#279) is in the game. The three weapon x
 * lane combos (Content's table on #310 as the GD locked it, ticket 320) are authored at P20, P25
 * and P27, each between one armoury lane and one of the six, and their templates are the only
 * way the armoury joins the endless rotation.
 *
 * Combos have no Marks and mount nothing new: they read their parents' current values (#162 4.6).
 * Parents are named by node id only, so this slice imports no lane slice.
 */
import type { ComboLane } from '../../tech-tree'

/** One combo store item, as #162 and the ticket 206 table write it. */
export interface ComboItem {
  /** The bare catalogue id (#224), shared by the store, the tree and the descriptions. */
  itemId: string
  /** Sentence case: other hardware, not a named extractor or artefact (#159 naming ruling). */
  name: string
  iconId: string
  /** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
  description: string
  lanes: readonly [ComboLane, ComboLane]
  /** The two capability nodes it combines, one in each lane. */
  parents: readonly [string, string]
  /**
   * The store items those nodes unlock, in the same order: what a grade needs owned (GD lock on
   * #206, decision 7) and whose current values the card shows (decision 8).
   */
  parentItemIds: readonly [string, string]
  /**
   * Counts in the trip's `incomeItemValue` under the hard 15% clamp (#162 4.5; GD on ticket 206,
   * 7 Oct: the lodestone drain and the lens corer too).
   */
  isIncomeCombo: boolean
  /** The authored grade-1 node; null for an endless-only template's combo (from P41). */
  node: ComboNode | null
  /**
   * The schedule rows its lanes anchor on: a weapon x lane combo's weapon row (GD decision on
   * #310). With them, every grade also waits on the `research_lab` row and stays off the screen
   * until all are unlocked, so it never previews a locked anchor. Absent for the six lanes'.
   */
  anchorRowIds?: readonly string[]
}

/** An authored combo's node (#161 section 1, the combo rows). */
export interface ComboNode {
  id: string
  iconId: string
  /** The planet it can first be researched on; the one-off price is read there too (#162 4.1). */
  unlockTier: number
}

export const COMBO_ITEMS: readonly ComboItem[] = [
  {
    itemId: 'combo.assay_drain',
    name: 'Assay drain',
    iconId: 'item-combo-assay-drain',
    description: 'The lens guides the drain leads to the richest seams first.',
    lanes: ['sensing', 'extraction'],
    parents: ['tech.sensing.assay_lens', 'tech.extraction.mineral_drain'],
    parentItemIds: ['passive.assay_lens', 'power.mineral_drain'],
    isIncomeCombo: true,
    node: { id: 'tech.combo.assay_drain', iconId: 'node-combo-assay-drain', unlockTier: 15 },
  },
  {
    itemId: 'combo.magnetic_survey',
    name: 'Magnetic survey',
    iconId: 'item-combo-magnetic-survey',
    description: "The sounder's echo tells the shifter coil where the ore lies thickest.",
    lanes: ['sensing', 'terrain'],
    parents: ['tech.sensing.echo_sounder', 'tech.terrain.ore_shifter'],
    parentItemIds: ['power.echo_sounder', 'power.ore_shifter'],
    isIncomeCombo: false,
    node: {
      id: 'tech.combo.magnetic_survey',
      iconId: 'node-combo-magnetic-survey',
      unlockTier: 18,
    },
  },
  {
    itemId: 'combo.foam_cutters',
    name: 'Foam cutters',
    iconId: 'item-combo-foam-cutters',
    description: 'Nozzles on the flank cutters lay setting foam behind each cut.',
    lanes: ['terrain', 'drill-gear'],
    parents: ['tech.terrain.stabiliser_foam', 'tech.drill_gear.side_cutters'],
    parentItemIds: ['consumable.stabiliser_foam', 'gear.side_cutters'],
    isIncomeCombo: false,
    node: { id: 'tech.combo.foam_cutters', iconId: 'node-combo-foam-cutters', unlockTier: 21 },
  },
  {
    itemId: 'combo.alarm_shield',
    name: 'Alarm shield',
    iconId: 'item-combo-alarm-shield',
    description: 'The periscope trips a valve and the steam curtain rises unbidden.',
    lanes: ['sensing', 'mobility'],
    parents: ['tech.sensing.threat_periscope', 'tech.mobility.steam_shield'],
    parentItemIds: ['passive.threat_periscope', 'power.steam_shield'],
    isIncomeCombo: false,
    node: { id: 'tech.combo.alarm_shield', iconId: 'node-combo-alarm-shield', unlockTier: 24 },
  },
  {
    itemId: 'combo.cored_drain',
    name: 'Cored drain',
    iconId: 'item-combo-cored-drain',
    description: 'Drain leads threaded down a corer bore tap a distant seam.',
    lanes: ['drill-gear', 'extraction'],
    parents: ['tech.drill_gear.sampling_corer', 'tech.extraction.mineral_drain'],
    parentItemIds: ['gear.sampling_corer', 'power.mineral_drain'],
    isIncomeCombo: true,
    node: { id: 'tech.combo.cored_drain', iconId: 'node-combo-cored-drain', unlockTier: 28 },
  },
  {
    itemId: 'combo.ceiling_anchor',
    name: 'Ceiling anchor',
    iconId: 'item-combo-ceiling-anchor',
    description: 'Pinned to the roof, the twin bits bite upward at a slant.',
    lanes: ['mobility', 'drill-gear'],
    parents: ['tech.mobility.grav_anchor', 'tech.drill_gear.twin_bit'],
    parentItemIds: ['power.grav_anchor', 'gear.twin_bit'],
    isIncomeCombo: false,
    node: { id: 'tech.combo.ceiling_anchor', iconId: 'node-combo-ceiling-anchor', unlockTier: 36 },
  },
  {
    itemId: 'combo.lodestone_drain',
    name: 'Lodestone drain',
    iconId: 'item-combo-lodestone-drain',
    description: "The beacon's gathered vein feeds the drain leads from across the field.",
    lanes: ['extraction', 'terrain'],
    parents: ['tech.extraction.mineral_drain', 'tech.terrain.lodestone_beacon'],
    parentItemIds: ['power.mineral_drain', 'consumable.lodestone_beacon'],
    isIncomeCombo: true,
    node: null,
  },
  {
    itemId: 'combo.lens_corer',
    name: 'Lens corer',
    iconId: 'item-combo-lens-corer',
    description: 'The assay prism steers the corer toward the richest glint in reach.',
    lanes: ['sensing', 'drill-gear'],
    parents: ['tech.sensing.assay_lens', 'tech.drill_gear.sampling_corer'],
    parentItemIds: ['passive.assay_lens', 'gear.sampling_corer'],
    isIncomeCombo: true,
    node: null,
  },
  {
    itemId: 'combo.foam_grapple',
    name: 'Foam grapple',
    iconId: 'item-combo-foam-grapple',
    description: 'A foam charge on the hook sets hard in open air and holds the line.',
    lanes: ['terrain', 'mobility'],
    parents: ['tech.terrain.stabiliser_foam', 'tech.mobility.grapple_winch'],
    parentItemIds: ['consumable.stabiliser_foam', 'power.grapple_winch'],
    isIncomeCombo: false,
    node: null,
  },
  {
    itemId: 'combo.aether_reel',
    name: 'Aether reel',
    iconId: 'item-combo-aether-reel',
    description: 'The winch takes up the tether line and hauls the aether lump home.',
    lanes: ['extraction', 'mobility'],
    parents: ['tech.extraction.aether_tether', 'tech.mobility.grapple_winch'],
    parentItemIds: ['rig.aether_tether', 'power.grapple_winch'],
    isIncomeCombo: false,
    node: null,
  },
  {
    itemId: 'combo.lull_line',
    name: 'Lull line',
    iconId: 'item-combo-lull-line',
    description: "The whistle's note runs down the line and calls the hunters to its end.",
    lanes: ['aetheric', 'extraction'],
    parents: ['tech.aetheric.resonance_whistle', 'tech.extraction.aether_tether'],
    parentItemIds: ['power.resonance_whistle', 'rig.aether_tether'],
    isIncomeCombo: false,
    node: null,
  },
  {
    itemId: 'combo.still_foam',
    name: 'Still foam',
    iconId: 'item-combo-still-foam',
    description: "Foam laid in the governor's hush keeps its slow beat while setting.",
    lanes: ['aetheric', 'terrain'],
    parents: ['tech.aetheric.chronometric_governor', 'tech.terrain.stabiliser_foam'],
    parentItemIds: ['power.chronometric_governor', 'consumable.stabiliser_foam'],
    isIncomeCombo: false,
    node: null,
  },
  {
    itemId: 'combo.warning_chime',
    name: 'Warning chime',
    iconId: 'item-combo-warning-chime',
    description: 'A sighting trips the valve and the whistle cries a warning.',
    lanes: ['aetheric', 'sensing'],
    parents: ['tech.aetheric.resonance_whistle', 'tech.sensing.threat_periscope'],
    parentItemIds: ['power.resonance_whistle', 'passive.threat_periscope'],
    isIncomeCombo: false,
    node: null,
  },
  {
    itemId: 'combo.pendulum_anchor',
    name: 'Pendulum anchor',
    iconId: 'item-combo-pendulum-anchor',
    description: 'Pinned in the air, the gyro swings and hunters slow around it.',
    lanes: ['aetheric', 'mobility'],
    parents: ['tech.aetheric.chronometric_governor', 'tech.mobility.grav_anchor'],
    parentItemIds: ['power.chronometric_governor', 'power.grav_anchor'],
    isIncomeCombo: false,
    node: null,
  },
  {
    itemId: 'combo.quench_cutters',
    name: 'Quench cutters',
    iconId: 'item-combo-quench-cutters',
    description: "The condenser drinks the flank cutters' heat and returns it as charge.",
    lanes: ['aetheric', 'drill-gear'],
    parents: ['tech.aetheric.aether_condenser', 'tech.drill_gear.side_cutters'],
    parentItemIds: ['power.aether_condenser', 'gear.side_cutters'],
    isIncomeCombo: false,
    node: null,
  },
  {
    itemId: 'combo.sounding_bore',
    name: 'Sounding bore',
    iconId: 'item-combo-sounding-bore',
    description: 'Each bore rings the stone like a sounder, and nearby ore answers.',
    lanes: ['armoury.bore_gun', 'sensing'],
    parents: ['tech.bore_gun.long_barrel', 'tech.sensing.echo_sounder'],
    parentItemIds: ['weapon.long_barrel', 'power.echo_sounder'],
    isIncomeCombo: false,
    node: { id: 'tech.combo.sounding_bore', iconId: 'node-combo-sounding-bore', unlockTier: 20 },
    anchorRowIds: ['bore_gun'],
  },
  {
    itemId: 'combo.winch_bore',
    name: 'Winch bore',
    iconId: 'item-combo-winch-bore',
    description: 'The grapple flies down the fresh bore and bites at its end.',
    lanes: ['armoury.bore_gun', 'mobility'],
    parents: ['tech.bore_gun.long_barrel', 'tech.mobility.grapple_winch'],
    parentItemIds: ['weapon.long_barrel', 'power.grapple_winch'],
    isIncomeCombo: false,
    node: { id: 'tech.combo.winch_bore', iconId: 'node-combo-winch-bore', unlockTier: 25 },
    anchorRowIds: ['bore_gun'],
  },
  {
    itemId: 'combo.spotter_guns',
    name: 'Spotter guns',
    iconId: 'item-combo-spotter-guns',
    description: 'The periscope reads the dust; the turrets wait on the first crack.',
    lanes: ['armoury.auto_guns', 'sensing'],
    parents: ['tech.auto_guns.fire_director', 'tech.sensing.threat_periscope'],
    parentItemIds: ['weapon.fire_director', 'passive.threat_periscope'],
    isIncomeCombo: false,
    node: { id: 'tech.combo.spotter_guns', iconId: 'node-combo-spotter-guns', unlockTier: 27 },
    anchorRowIds: ['auto_guns'],
  },
]

/** The catalogue row of `itemId`, or null for an item that is not a combo of this slice. */
export function comboItemOf(itemId: string): ComboItem | null {
  return COMBO_ITEMS.find((item) => item.itemId === itemId) ?? null
}
