// Which feature a Vitest file belongs to, for the CI test metrics (scripts/ci/testMetrics.mjs) and
// the status page's Tests tab (#192). The one table of the mapping: first matching rule wins, `$1`
// takes the rule's first capture. Feature slices (src/features/<slice>/, #155) map to their slice;
// until #191 decides how layer-sliced tests declare a feature, the rest map by folder. A file no
// rule matches lands under `unmapped`, so the gaps show.
export const UNMAPPED_FEATURE = 'unmapped'

export const FEATURE_RULES = [
  // The three pacing bot regressions: nightly only (NIGHTLY_ONLY_TESTS in vite.config.ts).
  { pattern: /^src\/logging\/(pacingGate|assayPacingGate)\.test\.ts$/, feature: 'pacing-bot' },
  { pattern: /^src\/systems\/bot\/playSlice\.test\.ts$/, feature: 'pacing-bot' },
  // The golden replays of tests/golden.
  {
    pattern:
      /^src\/(logging\/(goldenRun|secondSliceGolden)|systems\/world\/generatorGolden)\.test\.ts$/,
    feature: 'golden-replay',
  },
  { pattern: /^src\/features\/([^/]+)\//, feature: '$1' },
  { pattern: /^src\/systems\/([^/]+)\//, feature: '$1' },
  { pattern: /^src\/systems\/[^/]+\.test\.ts$/, feature: 'systems-core' },
  { pattern: /^src\/(logging|store|debug|physics|scene|ui|shell|constants|data)\//, feature: '$1' },
  { pattern: /^scripts\/([^/]+)\//, feature: 'tooling-$1' },
]

/** The feature of a repo-relative test file path (forward slashes). */
export function featureOfTestFile(path) {
  for (const rule of FEATURE_RULES) {
    const match = rule.pattern.exec(path)
    if (match) return rule.feature.replace('$1', match[1] ?? '')
  }
  return UNMAPPED_FEATURE
}
