/**
 * Version of what a seed generates (decision #4): bump it with any change to world generation, so
 * saves, snapshots, golden replays and run metadata can refuse to mix worlds from different
 * generators. The planet generator (Build 2) owns every bump from here on. Version 2 is the
 * density field and ore patches (#36, #42); version 3 places the artefact cache (#46); version 4
 * widens the pad under the Refinery bay from planet 3 (#105), planets 1 and 2 unchanged; version 5
 * paints lava pockets on the heat planets 8 to 16 (#113), planets 1 to 7 unchanged; version 6 lays
 * the pad from -8 to +12 under the two shop buildings, growing east from planet 10 (#170, #175);
 * version 7 rolls each ore patch's rarity lead, 0, +1 or +2 tiers, on every planet (#140, #146);
 * version 8 gives each ore patch from planet 3 its planet's family mix and signature (#141, #147),
 * planets 1 and 2 unchanged; version 9 rolls the rarity rows, common to mythic, on each ore patch of
 * a planet entered under the ore rules from planet 3, the band-4 signature carved from common (ticket
 * 445), while a planet a save holds without the rules and planets 1 and 2 keep the lead rows;
 * version 10 draws a material kind per ore patch on every planet entered under ore rules 2, from
 * planet 1 (ticket 446), written to the cell's kind slot alone, while a planet a save holds keeps its
 * cells; version 11 thins each ore patch to the depth density curve on a planet entered under ore
 * rules 3 from planet 3 (ticket 448), while planets 1 and 2 and every planet a save holds keep the
 * step bands; version 12 pins the rock of the top 3 cells at the surface hardness and ramps it to
 * band 1's value on every planet entered under ore rules 5 from planet 2 (ticket 625), the cells
 * themselves unchanged, while planet 1 and every planet a save holds keep the shipped band hardness;
 * version 13 sizes every planet entered under ore rules 7 from planet 2 by its planet registry row
 * (ticket 643), its core, bands and band-placed content with it, and never shortens the surface
 * ramp to fit band 1, while planet 1 (whose row is its ladder radius), every planet past the last
 * row and every planet a save holds keep #6's ladder. Ore rules 8 (ticket 652) lays each planet's
 * hazard pockets from planet 2 as a read of the cells, which it never repaints, so it moves no
 * generated cell and needs no bump. Version 14 draws P2's three own kinds, Cinnabar, Aquamarine and
 * Jet, on its uncommon and rare patches of bands 4 and 5 on a planet 2 entered under ore rules 9
 * (ticket 709, TD ruling: v13 kept as the versioned path), which rewrites the kind slot of those
 * patches alone, while planet 1, planets 3 on and every planet a save holds keep the cells of 13.
 */
export const GENERATOR_VERSION = 14
