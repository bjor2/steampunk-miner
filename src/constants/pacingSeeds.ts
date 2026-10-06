/**
 * The world seeds each pacing scenario is played on (#84, Game Director: the slice band, the
 * planet 1 core and the assay gate are judged on the median of three seeded runs, so one run's
 * combat deaths cannot flip a gate). The scenario's own `worldSeed` comes first, so the committed
 * baseline and `compareRuns` stay on it. The other two are fixed, and planet 1 of each builds
 * without the dock-guaranteed ore patch (#42 `patch_dock_guaranteed` 0), as 83921's does.
 */
export const PACING_WORLD_SEEDS = {
  'bot-slice': [83921, 31415, 27182],
  'bot-slice-assay': [83921, 31415, 27182],
} as const
