/**
 * Version of what a seed generates (decision #4): bump it with any change to world generation, so
 * saves, snapshots, golden replays and run metadata can refuse to mix worlds from different
 * generators. The planet generator (Build 2) owns every bump from here on. Version 2 is the
 * density field and ore patches (#36, #42); version 3 places the artefact cache (#46); version 4
 * widens the pad under the Refinery bay from planet 3 (#105), planets 1 and 2 unchanged; version 5
 * paints lava pockets on the heat planets 8 to 16 (#113), planets 1 to 7 unchanged; version 6 lays
 * the pad from -8 to +12 under the two shop buildings, growing east from planet 10 (#170, #175);
 * version 7 rolls each ore patch's rarity lead, 0, +1 or +2 tiers, on every planet (#140, #146).
 */
export const GENERATOR_VERSION = 7
