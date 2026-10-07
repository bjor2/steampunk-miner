/**
 * Why each combo is still a vision row (GD lock on #205 Q2 and Q3: an item whose mechanic is not
 * in the game, or whose prerequisite is held back, stays unregistered). Each combo changes how a
 * parent item of a closed lane slice plays, and that slice exposes no hook a combo can reach
 * without importing it (ticket 206 acceptance: combos never import a lane slice), so every row
 * waits for its seam. The templates wait with their combos: a generated grade of a template would
 * unlock a store item with no effect.
 */
export const COMBO_HOLDS: Readonly<Record<string, string>> = {
  'combo.assay_drain': "the mineral drain's cell order is extraction's, with no hook",
  'combo.magnetic_survey':
    "the ore-shifter's drag target is terrain-tools'; echo pings are render-only",
  'combo.foam_cutters': 'stabiliser foam is held back (#202), and side cutters have no hook',
  'combo.alarm_shield': 'periscope warnings are render-only; the shield fires only from a slot',
  'combo.cored_drain': "the corer keeps no sampled vein, and the drain's reach is extraction's",
  'combo.lodestone_drain': "the drain's reach and the beacon's gather radius have no hook",
  'combo.lens_corer': "the corer's aim is drill-gear's, with no hook",
  'combo.foam_grapple': 'stabiliser foam is held back (#202), and the grapple has no hook',
  'combo.aether_reel': "the tether's tow is mining-gates' and the winch is mobility's, no hook",
  'combo.ceiling_anchor': 'item and node moved to #288, after the twin-bit diagonal',
}
