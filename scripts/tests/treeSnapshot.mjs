// What the move-PR guard (#230) compares, collected from one checkout: the test IDs `vitest list`
// prints, the hashes of the pinned files (movePrGuard.mjs `pinOfPath`) and, when asked, the output
// of `balance:*` commands. Side effects live here; the rules stay pure in movePrGuard.mjs.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pinnedHashesOf, pinOfPath, testIdsOfListing } from './movePrGuard.mjs'

const BALANCE_REPORT_FOLDER = 'balance-report'
const OUTPUT_BUFFER_BYTES = 512 * 1024 * 1024

/** The snapshot `{ testIds, pinned }` of the checkout at `root`, running each named balance report. */
export function snapshotTree(root, balanceNames) {
  return {
    testIds: listTestIds(root),
    pinned: {
      ...pinnedHashesOf(pinnedFilesOf(root)),
      ...balanceOutputHashesOf(root, balanceNames),
    },
  }
}

function listTestIds(root) {
  const folder = mkdtempSync(join(tmpdir(), 'move-pr-guard-'))
  try {
    const listingFile = join(folder, 'tests.json')
    runQuietly(root, process.execPath, [
      'node_modules/vitest/vitest.mjs',
      'list',
      `--json=${listingFile}`,
    ])
    return testIdsOfListing(JSON.parse(readFileSync(listingFile, 'utf8')))
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

function pinnedFilesOf(root) {
  return listRepoFiles(root)
    .filter((path) => pinOfPath(path) !== null && existsSync(join(root, path)))
    .map((path) => ({ path, hash: hashOfFile(join(root, path)) }))
}

function listRepoFiles(root) {
  const listing = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: OUTPUT_BUFFER_BYTES,
    },
  )
  return listing.split('\0').filter((path) => path.length > 0)
}

function balanceOutputHashesOf(root, balanceNames) {
  const hashes = {}
  for (const name of balanceNames) Object.assign(hashes, runBalanceReport(root, name))
  return hashes
}

// The printed report and every file the command leaves in balance-report/ (balance:report writes
// the first seed's events, commands and summary there).
function runBalanceReport(root, name) {
  rmSync(join(root, BALANCE_REPORT_FOLDER), { recursive: true, force: true })
  const printed = runQuietly(root, 'npm', ['run', '--silent', `balance:${name}`])
  return {
    [`balance-output:balance:${name} stdout`]: hashOfText(printed),
    ...reportFolderHashesOf(root, name),
  }
}

function reportFolderHashesOf(root, name) {
  const folder = join(root, BALANCE_REPORT_FOLDER)
  if (!existsSync(folder)) return {}
  const hashes = {}
  for (const file of readdirSync(folder).sort())
    hashes[`balance-output:balance:${name} ${BALANCE_REPORT_FOLDER}/${file}`] = hashOfFile(
      join(folder, file),
    )
  return hashes
}

// Both trees run with the same environment: no CI job summary, and the nightly-only specs listed.
function runQuietly(root, command, args) {
  const env = { ...process.env }
  delete env.GITHUB_STEP_SUMMARY
  delete env.SKIP_NIGHTLY_ONLY_TESTS
  return execFileSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: OUTPUT_BUFFER_BYTES,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function hashOfFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function hashOfText(text) {
  return createHash('sha256').update(text).digest('hex')
}
