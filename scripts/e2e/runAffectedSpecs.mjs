#!/usr/bin/env node
// Runs only the browser e2e specs a change can affect (#190), through e2e/affected.json. The
// changed paths are the diff against the merge base with a ref plus uncommitted and untracked
// files, or the listing in CHANGED_FILES (the box Tester's union of a spec's tickets, as for
// selectPushTests.sh).
// A base git cannot resolve runs the full suite. Arguments it does not know go to Playwright.
//
//   npm run test:e2e:affected                          against origin/main
//   npm run test:e2e:affected -- --base <ref>          against another ref
//   CHANGED_FILES=<listing> npm run test:e2e:affected  a listed change set
//   npm run test:e2e:affected -- --dry-run             print the choice, run nothing
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { browserSpecPathsOf, selectAffectedSpecs } from './affectedSpecs.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DEFAULT_BASE = 'origin/main'
const OWN_FLAGS_WITH_VALUE = ['--base']
const OWN_FLAGS = ['--dry-run']

function readOptions(args) {
  const baseAt = args.indexOf('--base')
  return {
    base: baseAt === -1 ? DEFAULT_BASE : args[baseAt + 1],
    isDryRun: args.includes('--dry-run'),
    playwrightArgs: argsForPlaywright(args),
  }
}

function argsForPlaywright(args) {
  return args.filter((arg, at) => !OWN_FLAGS.includes(arg) && !isOwnFlagOrValue(args, arg, at))
}

function isOwnFlagOrValue(args, arg, at) {
  return OWN_FLAGS_WITH_VALUE.includes(arg) || OWN_FLAGS_WITH_VALUE.includes(args[at - 1])
}

function gitLines(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' })
    .split('\n')
    .filter(Boolean)
}

/** The changed paths, or undefined when the base cannot be resolved. */
function readChangedPaths(base) {
  if (process.env.CHANGED_FILES) return readListedPaths(process.env.CHANGED_FILES)
  try {
    const [mergeBase] = gitLines(['merge-base', base, 'HEAD'])
    return [
      ...gitLines(['diff', '--name-only', mergeBase]),
      ...gitLines(['ls-files', '--others', '--exclude-standard']),
    ]
  } catch {
    return undefined
  }
}

function readListedPaths(listing) {
  return readFileSync(listing, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function chooseRun(base) {
  const changed = readChangedPaths(base)
  if (changed === undefined) return { mode: 'full', reason: `no usable base '${base}'`, specs: [] }
  const map = JSON.parse(readFileSync(new URL('../../e2e/affected.json', import.meta.url), 'utf8'))
  const specs = browserSpecPathsOf(
    readdirSync(new URL('../../e2e/browser', import.meta.url), { recursive: true }),
  )
  return selectAffectedSpecs(map, specs, changed)
}

function printChoice(choice) {
  console.log(`e2e mode: ${choice.mode} (${choice.reason})`)
  for (const spec of choice.specs) console.log(`  ${spec}`)
}

function runPlaywright(choice, playwrightArgs) {
  const args = ['playwright', 'test', ...choice.specs, ...playwrightArgs]
  return spawnSync('npx', args, { cwd: REPO_ROOT, stdio: 'inherit' }).status ?? 1
}

function main() {
  const options = readOptions(process.argv.slice(2))
  const choice = chooseRun(options.base)
  printChoice(choice)
  if (options.isDryRun || choice.mode === 'none') return 0
  return runPlaywright(choice, options.playwrightArgs)
}

process.exitCode = main()
