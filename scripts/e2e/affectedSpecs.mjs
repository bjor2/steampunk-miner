// Affected-spec selection for the browser e2e layer (#190): which Playwright specs a change set can
// affect, through the map in e2e/affected.json (its $comment states the lookup order). Pure: the
// caller reads the map, lists the specs on disk and the changed paths.

const GLOB_TOKENS = /\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g
const GLOB_SOURCES = { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' }

/** A glob (`**`, `*`, `?`) over forward-slash paths as an anchored RegExp. */
export function regExpOfGlob(glob) {
  return new RegExp(`^${glob.replace(GLOB_TOKENS, regExpSourceOfGlobToken)}$`)
}

function regExpSourceOfGlobToken(token) {
  return GLOB_SOURCES[token] ?? `\\${token}`
}

function matchesAnyGlob(globs, path) {
  return globs.some((glob) => regExpOfGlob(glob).test(path))
}

/**
 * The run for a change set: `{ mode: 'full' | 'affected' | 'none', reason, specs }`. `specs` is
 * sorted and empty unless the mode is `affected`; the first path that needs every spec decides a
 * full run.
 */
export function selectAffectedSpecs(map, specPaths, changedPaths) {
  const choices = changedPaths.map((path) => choiceForChangedPath(map, specPaths, path))
  return combinedChoice(choices)
}

function choiceForChangedPath(map, specPaths, path) {
  if (specPaths.includes(path)) return { specs: [path] }
  if (matchesAnyGlob(map.fullSuite, path)) return { fullReason: `${path} runs the full suite` }
  if (matchesAnyGlob(map.noBrowserEffect, path)) return { specs: [] }
  return choiceFromRules(map.rules, path)
}

function choiceFromRules(rules, path) {
  const matching = rules.filter((rule) => matchesAnyGlob(rule.paths, path))
  if (matching.length === 0) return { fullReason: `no rule in e2e/affected.json maps ${path}` }
  return { specs: matching.flatMap((rule) => rule.specs) }
}

function combinedChoice(choices) {
  const full = choices.find((choice) => choice.fullReason !== undefined)
  if (full !== undefined) return { mode: 'full', reason: full.fullReason, specs: [] }
  const specs = [...new Set(choices.flatMap((choice) => choice.specs))].sort()
  if (specs.length === 0) return { mode: 'none', reason: noSpecsReason(choices), specs }
  return {
    mode: 'affected',
    reason: `${choices.length} changed path(s) map to ${specs.length} spec(s)`,
    specs,
  }
}

function noSpecsReason(choices) {
  return choices.length === 0 ? 'no changed paths' : 'no changed path reaches the browser build'
}

/** The specs on disk that no rule names, so no source change would ever select them. */
export function specsNoRuleNames(map, specPaths) {
  const named = new Set(map.rules.flatMap((rule) => rule.specs))
  return specPaths.filter((spec) => !named.has(spec))
}

/** The specs a rule names that are not on disk. */
export function namedSpecsMissingOnDisk(map, specPaths) {
  const onDisk = new Set(specPaths)
  return [...new Set(map.rules.flatMap((rule) => rule.specs))].filter((spec) => !onDisk.has(spec))
}

/** `e2e/browser/**\/*.spec.ts` paths from a recursive listing of `e2e/browser`, sorted. */
export function browserSpecPathsOf(entries) {
  return entries
    .map((entry) => `e2e/browser/${String(entry).replaceAll('\\', '/')}`)
    .filter((path) => path.endsWith('.spec.ts'))
    .sort()
}
