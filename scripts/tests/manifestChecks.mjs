// The box Tester's checks on tests/MANIFEST.md (#229): drift against the test files on disk, the
// Horizontal Scaler's guard (the GD lock on #191: every slice that ships a scheduled stats.json row
// has at least one test), and the cross-slice checks pointing at files that exist. Pure; each
// returns problems, none when the manifest holds.
import { MANIFEST_COMMAND, sliceOfTestFile } from './testManifest.mjs'

/** Files missing from the manifest or gone from disk, and files whose test sites changed. */
export function manifestDriftProblems(diskFiles, manifestFiles) {
  const diskPaths = new Set(diskFiles.map(({ path }) => path))
  return [
    ...diskFiles.flatMap((file) => diskFileProblems(file, manifestFiles.get(file.path))),
    ...[...manifestFiles.keys()]
      .filter((path) => !diskPaths.has(path))
      .map((path) => `${path} is in the manifest but not on disk: run \`${MANIFEST_COMMAND}\``),
  ]
}

function diskFileProblems({ path, sites }, row) {
  if (row === undefined) return [`${path} is not in the manifest: run \`${MANIFEST_COMMAND}\``]
  if (row.sites === sites) return []
  return [`${path} has ${sites} test sites, the manifest ${row.sites}: run \`${MANIFEST_COMMAND}\``]
}

/** Slices that ship a schedule row (`{ rowId, sliceId }` claims) with no test in the manifest. */
export function scheduledSlicesWithoutTests(claims, manifestFiles) {
  const testsBySlice = countTestsBySlice(manifestFiles)
  const rowsBySlice = groupRowsBySlice(claims)
  return [...rowsBySlice]
    .filter(([slice]) => (testsBySlice.get(slice) ?? 0) === 0)
    .map(([slice, rowIds]) => untestedSliceProblem(slice, rowIds))
}

function countTestsBySlice(manifestFiles) {
  const counts = new Map()
  manifestFiles.forEach(({ path, tests }) => {
    const slice = sliceOfTestFile(path)
    if (slice !== null) counts.set(slice, (counts.get(slice) ?? 0) + tests)
  })
  return counts
}

function groupRowsBySlice(claims) {
  const rows = new Map()
  claims.forEach(({ rowId, sliceId }) => rows.set(sliceId, [...(rows.get(sliceId) ?? []), rowId]))
  return new Map([...rows].sort(([a], [b]) => (a < b ? -1 : 1)))
}

function untestedSliceProblem(slice, rowIds) {
  const rows = [...rowIds].sort().join(', ')
  return `slice "${slice}" ships schedule rows ${rows} but has no test in the manifest`
}

/** Cross-slice checks naming a test file that is not on disk. */
export function crossSliceCheckProblems(checks, diskPaths) {
  return checks.flatMap(({ check, files }) =>
    files
      .filter((path) => !diskPaths.has(path))
      .map((path) => `cross-slice check "${check}" names ${path}, which is not on disk`),
  )
}
