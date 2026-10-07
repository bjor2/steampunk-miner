// Writes tests/MANIFEST.md from `vitest list` (#229). Listing the whole suite collects every file
// and takes minutes on a loaded box, so by default only the files that are new or whose test sites
// changed are listed again; the other rows are kept.
//
//   npm run tests:manifest                       new and changed test files
//   npm run tests:manifest -- <test files...>    those files as well (an `it.each` table that grew)
//   npm run tests:manifest -- --all              the whole suite
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CROSS_SLICE_CHECKS, GATE_SEEDS } from './crossSliceChecks.mjs'
import { readDiskTestFiles, readManifestFilesAt } from './testFiles.mjs'
import {
  countListedTests,
  MANIFEST_PATH,
  refreshManifestFiles,
  renderTestManifest,
  staleTestPaths,
} from './testManifest.mjs'

const ALL_FLAG = '--all'

function writeTestManifest(root, args) {
  const diskFiles = readDiskTestFiles(root)
  const manifestFiles = readManifestFilesAt(root)
  const refreshedPaths = pathsToRefresh(args, diskFiles, manifestFiles)
  const listedCounts = listTestsOf(root, refreshedPaths, args.includes(ALL_FLAG))
  const files = refreshManifestFiles({ diskFiles, manifestFiles, listedCounts, refreshedPaths })
  writeFileSync(
    join(root, MANIFEST_PATH),
    renderTestManifest(files, CROSS_SLICE_CHECKS, GATE_SEEDS),
  )
  return reportWritten(files, refreshedPaths)
}

function pathsToRefresh(args, diskFiles, manifestFiles) {
  if (args.includes(ALL_FLAG)) return new Set(diskFiles.map(({ path }) => path))
  const asked = args.map((arg) => arg.replaceAll('\\', '/').replace(/^\.\//, ''))
  refuseUnknownTestFiles(asked, diskFiles)
  return new Set([...staleTestPaths(diskFiles, manifestFiles), ...asked])
}

function refuseUnknownTestFiles(paths, diskFiles) {
  const known = new Set(diskFiles.map(({ path }) => path))
  const unknown = paths.filter((path) => !known.has(path))
  if (unknown.length > 0) throw new Error(`not Vitest files of this repo: ${unknown.join(', ')}`)
}

/** Tests per file, listed with the nightly-only files included (the manifest lists every test). */
function listTestsOf(root, paths, isWholeSuite) {
  if (paths.size === 0) return new Map()
  const folder = mkdtempSync(join(tmpdir(), 'test-manifest-'))
  try {
    const out = join(folder, 'list.json')
    runVitestList(root, out, isWholeSuite ? [] : [...paths])
    return countListedTests(JSON.parse(readFileSync(out, 'utf8')), root)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

function runVitestList(root, out, filters) {
  const env = { ...process.env }
  delete env.SKIP_NIGHTLY_ONLY_TESTS
  const run = spawnSync('npx', ['vitest', 'list', `--json=${out}`, ...filters], {
    cwd: root,
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  if (run.status !== 0) throw new Error(`vitest list exited with ${run.status ?? run.signal}`)
}

function reportWritten(files, refreshedPaths) {
  const tests = files.reduce((sum, file) => sum + file.tests, 0)
  return `${MANIFEST_PATH}: ${files.length} files, ${tests} tests (${refreshedPaths.size} listed again)`
}

console.log(writeTestManifest(process.cwd(), process.argv.slice(2)))
