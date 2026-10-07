// Whether the e2e preview must build first (#190). The box Tester builds right before Playwright,
// and the webServer used to build again (~80 s); a dist/ newer than every build input is reused.
// Pure: the caller reads the modification times.

/** The files and folders whose change changes `dist/` (vite.config.ts, index.html and the sources). */
export const BUILD_INPUTS = [
  'src',
  'public',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
]

/**
 * `{ isBuildNeeded, reason }` from the built `dist/index.html`'s mtime (undefined when missing) and
 * the newest build input `{ path, mtimeMs }`.
 */
export function previewBuildChoice(builtAtMs, newestInput) {
  if (builtAtMs === undefined) return { isBuildNeeded: true, reason: 'dist/index.html is missing' }
  if (newestInput.mtimeMs > builtAtMs)
    return { isBuildNeeded: true, reason: `${newestInput.path} is newer than dist/` }
  return {
    isBuildNeeded: false,
    reason: `dist/ is newer than every build input (newest: ${newestInput.path})`,
  }
}

/** The input with the latest mtime among `{ path, mtimeMs }` entries. */
export function newestOf(inputs) {
  return inputs.reduce((newest, input) => (input.mtimeMs > newest.mtimeMs ? input : newest))
}
