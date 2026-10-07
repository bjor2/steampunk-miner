/**
 * The milestone combos (spec #162 section 1, the milestone combos table; #161 sections 1 and 2;
 * ticket 206 "Combo templates"): one row per combo store item and one `tech-combo-template` row
 * per lane pair. Five combos are authored nodes researched at the `research_lab` (P15 onward);
 * the four templates Content added on 7 Oct are endless only, first seen as a generated combo
 * from P41. The ceiling anchor's item and node moved to #288; its template row stays here, so the
 * template line is ten (#245 lock).
 *
 * Combos have no Marks and mount nothing new: they read their parents' current values (#162 4.6).
 * Parents are named by node id only, so this slice imports no lane slice.
 */
import type { TechLane } from '../../tech-tree'

/** One combo store item, as #162 and the ticket 206 table write it. */
export interface ComboItem {
  /** The bare catalogue id (#224), shared by the store, the tree and the descriptions. */
  itemId: string
  /** Sentence case: other hardware, not a named extractor or artefact (#159 naming ruling). */
  name: string
  iconId: string
  /** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
  description: string
  lanes: readonly [TechLane, TechLane]
  /** The two capability nodes it combines, one in each lane. */
  parents: readonly [string, string]
  /**
   * Counts in the trip's `incomeItemValue` under the hard 15% clamp (#162 4.5; GD on ticket 206,
   * 7 Oct: the lodestone drain and the lens corer too).
   */
  isIncomeCombo: boolean
  /** The authored grade-1 node; null for an endless-only template's combo (from P41). */
  node: ComboNode | null
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
    isIncomeCombo: true,
    node: { id: 'tech.combo.cored_drain', iconId: 'node-combo-cored-drain', unlockTier: 28 },
  },
  {
    itemId: 'combo.lodestone_drain',
    name: 'Lodestone drain',
    iconId: 'item-combo-lodestone-drain',
    description: "The beacon's gathered vein feeds the drain leads from across the field.",
    lanes: ['extraction', 'terrain'],
    parents: ['tech.extraction.mineral_drain', 'tech.terrain.lodestone_beacon'],
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
    isIncomeCombo: false,
    node: null,
  },
]

/**
 * The ceiling anchor's template (mobility × drill-gear): its store item and authored node are
 * #288's, after the twin-bit diagonal (#279); the row is here because the template line is ten.
 */
export const CEILING_ANCHOR_TEMPLATE_ROW: Pick<
  ComboItem,
  'itemId' | 'name' | 'description' | 'lanes' | 'parents'
> = {
  itemId: 'combo.ceiling_anchor',
  name: 'Ceiling anchor',
  description: 'Pinned to the roof, the twin bits bite upward at a slant without a wobble.',
  lanes: ['mobility', 'drill-gear'],
  parents: ['tech.mobility.grav_anchor', 'tech.drill_gear.twin_bit'],
}

/** The catalogue row of `itemId`, or null for an item that is not a combo of this slice. */
export function comboItemOf(itemId: string): ComboItem | null {
  return COMBO_ITEMS.find((item) => item.itemId === itemId) ?? null
}
