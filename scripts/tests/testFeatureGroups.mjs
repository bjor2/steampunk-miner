// The feature a test file shows under on the status page's Tests tab (#192), by the GD lock on
// #191: its `src/features/<slice>/` folder, else `cross-slice` for a kernel file that a cross-slice
// check names, else `kernel`. `area` is the file's kernel area in tests/MANIFEST.md. Both read the
// manifest's own sources (sliceOfTestFile, CROSS_SLICE_CHECKS, featureOfTestFile), so the page and
// the manifest never disagree and nothing keeps a list of its own.
import { featureOfTestFile } from '../ci/testFeatures.mjs'
import { CROSS_SLICE_CHECKS } from './crossSliceChecks.mjs'
import { sliceOfTestFile } from './testManifest.mjs'

export const KERNEL_FEATURE = 'kernel'
export const CROSS_SLICE_FEATURE = 'cross-slice'

const CROSS_SLICE_FILES = new Set(CROSS_SLICE_CHECKS.flatMap((check) => check.files))

function featureGroupOf(path) {
  const slice = sliceOfTestFile(path)
  if (slice !== null) return slice
  return CROSS_SLICE_FILES.has(path) ? CROSS_SLICE_FEATURE : KERNEL_FEATURE
}

/** `{ feature, area }` of a repo-relative test file path. */
export function featureGroupOfTestFile(path) {
  return { feature: featureGroupOf(path), area: featureOfTestFile(path) }
}
