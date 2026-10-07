// The cross-slice section of tests/MANIFEST.md (the GD lock on #191, #229): kernel-owned checks
// that guard every slice at once, so no slice row can hold them. `files` are the Vitest files of a
// check (their counts come from the manifest rows), `commands` the long reports the box Tester runs,
// and `pending` says which ticket builds a check that has no file yet. When that ticket lands its
// test, it adds the file here and clears `pending`.

/** The pacing gate seeds (#84, `PACING_WORLD_SEEDS` in src/constants/pacingSeeds.ts, pinned). */
export const GATE_SEEDS = [83921, 31415, 27182]

export const CROSS_SLICE_CHECKS = [
  {
    check: 'Pacing gates: slice band, planet 1 core and assay gate, median of the gate seeds',
    decidedIn: '#84',
    files: ['src/logging/pacingGate.test.ts', 'src/logging/assayPacingGate.test.ts'],
    commands: [],
    pending: null,
  },
  {
    check:
      'Campaign scaling gate (R1): band 5 sawtooth on planets 1-7 and the schedule cadence, with the C1-C4 and H1-H2 probes',
    decidedIn: '#81, #89',
    files: [
      'src/logging/campaignScalingGate.test.ts',
      'src/logging/campaignPacingGate.test.ts',
      'src/systems/economy/upgradePrices.test.ts',
      'src/systems/economy/economyGrowth.test.ts',
      'src/systems/economy/casingPrices.test.ts',
      'src/systems/authority/casingPlacement.test.ts',
      'src/systems/vehicle/bandDig.test.ts',
      'src/logging/sawtoothMedian.test.ts',
      'src/systems/bot/botCoreRule.test.ts',
      'src/logging/pacingReport.test.ts',
      'src/systems/unlocks/readUnlockSchedule.test.ts',
      'src/systems/unlocks/travelUnlocks.test.ts',
      'src/systems/unlocks/scheduleCadence.test.ts',
      'src/systems/authority/featureUnlocks.test.ts',
    ],
    commands: ['npm run balance:planets'],
    pending: null,
  },
  {
    check: 'Balance guards, reported against the committed baseline or a control run',
    decidedIn: '#84, #105, #107, #109, #113, #198',
    files: [],
    commands: [
      'npm run balance:report',
      'npm run balance:planets',
      'npm run balance:guns',
      'npm run balance:charges',
      'npm run balance:refinery',
      'npm run balance:heat',
    ],
    pending: null,
  },
  {
    check: 'Every buyable has a description',
    decidedIn: '#159',
    files: [
      'src/systems/registries/buyableRefs.test.ts',
      'src/features/descriptions/systems/descriptionCoverage.test.ts',
    ],
    commands: [],
    pending: null,
  },
  {
    check: 'Every ore family has a gateClass row',
    decidedIn: '#141, #142',
    files: [],
    commands: [],
    pending: 'not built yet (#148)',
  },
  {
    check: 'Endless signature coverage, planets 41-65',
    decidedIn: '#148',
    files: [],
    commands: [],
    pending: 'not built yet (#148)',
  },
  {
    check: 'Locked unlock schedule and one home per stats.json row (stay in the kernel)',
    decidedIn: '#184, #191',
    files: [
      'src/systems/unlocks/unlockSchedule.test.ts',
      'src/systems/registries/scheduleRows.test.ts',
    ],
    commands: [],
    pending: null,
  },
]
