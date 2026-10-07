// The test files on disk and the manifest file, for writeTestManifest.mjs and the drift spec.
// The roots mirror `test.include` in vite.config.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { countTestSites, MANIFEST_PATH, readManifestFiles } from './testManifest.mjs'

const TEST_ROOTS = [
  { folder: 'src', suffix: '.test.ts' },
  { folder: 'scripts', suffix: '.test.mjs' },
]

/** Every Vitest file under the repo root: `{ path, sites }`, paths with forward slashes. */
export function readDiskTestFiles(root) {
  return TEST_ROOTS.flatMap(({ folder, suffix }) => testPathsUnder(root, folder, suffix))
    .sort()
    .map((path) => ({ path, sites: countTestSites(readFileSync(join(root, path), 'utf8')) }))
}

function testPathsUnder(root, folder, suffix) {
  return readdirSync(join(root, folder), { recursive: true })
    .map((entry) => `${folder}/${String(entry).replaceAll('\\', '/')}`)
    .filter((path) => path.endsWith(suffix))
}

/** The manifest's file rows, none when it does not exist yet. */
export function readManifestFilesAt(root) {
  const path = join(root, MANIFEST_PATH)
  return existsSync(path) ? readManifestFiles(readFileSync(path, 'utf8')) : new Map()
}
