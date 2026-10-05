/**
 * Version of what a seed generates (decision #4): bump it with any change to world generation, so
 * saves, snapshots, golden replays and run metadata can refuse to mix worlds from different
 * generators. The planet generator (Build 2) owns every bump from here on. Version 2 is the
 * density field and ore patches (#36, #42).
 */
export const GENERATOR_VERSION = 2
