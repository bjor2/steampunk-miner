// The move-PR guard's rules (#230, Vertical Scaler direction of the GD lock on #191): a PR that
// moves tests into feature slices never lowers the test count, keeps every test ID (the describe/it
// names `vitest list` prints, which do not carry the file), and leaves the goldens, the seeds, the
// balance output and the Vertical Scaler's tables byte-identical. Pure: checkMovePr.mjs collects a
// snapshot of each tree and hands both here.
import { VERTICAL_SOURCE_PATHS } from '../../docs/scaling/vertical/source_hash.mjs'

/** Tests on main at 3121095, the count #191 measured; no move PR may land below it. */
export const TEST_COUNT_FLOOR = 2163

// Which repo files the guard pins, first matching rule wins. Goldens move with the slice that owns
// them (#191), so they and the other movable data are keyed by file name; the seed constants and
// the Vertical Scaler's tables are read by path, so a move of one of them is a change.
const PIN_RULES = [
  { pattern: /\.golden\.json$/, group: 'golden', keyedBy: 'name' },
  { pattern: /^tests\/balance\/[^/]+\.json$/, group: 'balance', keyedBy: 'name' },
  { pattern: /\.scenario\.json$/, group: 'seed', keyedBy: 'name' },
  { pattern: /^src\/constants\/pacingSeeds\.ts$/, group: 'seed', keyedBy: 'path' },
]

/** The pin a repo-relative path (forward slashes) falls under, or null when it is not pinned. */
export function pinOfPath(path) {
  if (VERTICAL_SOURCE_PATHS.includes(path)) return { group: 'table', key: path }
  const rule = PIN_RULES.find((candidate) => candidate.pattern.test(path))
  if (!rule) return null
  return { group: rule.group, key: rule.keyedBy === 'name' ? fileNameOf(path) : path }
}

function fileNameOf(path) {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The pin key of a file and its hash, `<group>:<key>`; a key seen twice keeps both hashes. */
export function pinnedHashesOf(files) {
  const pinned = {}
  for (const file of files) addPinnedHash(pinned, file)
  return pinned
}

function addPinnedHash(pinned, { path, hash }) {
  const pin = pinOfPath(path)
  if (!pin) return
  const id = `${pin.group}:${pin.key}`
  pinned[id] = pinned[id] === undefined ? hash : [pinned[id], hash].sort().join(',')
}

/** The test IDs of a `vitest list --json` listing, one per test, file left out. */
export function testIdsOfListing(listing) {
  return listing.map((entry) => entry.name)
}

/** IDs present before that are gone (or fewer) after, with how many copies went missing. */
export function missingTestIds(beforeIds, afterIds) {
  const remaining = countIds(afterIds)
  const missing = []
  for (const [id, count] of countIds(beforeIds)) {
    const lost = count - (remaining.get(id) ?? 0)
    if (lost > 0) missing.push({ kind: 'missing-test-id', id, lost })
  }
  return missing
}

function countIds(ids) {
  const counts = new Map()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

/** A finding when the test count after the move is under the count before or the floor. */
export function testCountFindings(beforeCount, afterCount, floor) {
  const least = Math.max(beforeCount, floor)
  if (afterCount >= least) return []
  return [{ kind: 'test-count', before: beforeCount, after: afterCount, floor }]
}

/** Pinned files that changed, went missing or appeared between the two trees. */
export function pinnedFileFindings(beforePinned, afterPinned) {
  const ids = [...new Set([...Object.keys(beforePinned), ...Object.keys(afterPinned)])].sort()
  return ids.flatMap((id) => pinnedFileFinding(id, beforePinned[id], afterPinned[id]))
}

function pinnedFileFinding(id, beforeHash, afterHash) {
  if (beforeHash === afterHash) return []
  if (afterHash === undefined) return [{ kind: 'pinned-file-missing', id }]
  if (beforeHash === undefined) return [{ kind: 'pinned-file-added', id }]
  return [{ kind: 'pinned-file-changed', id }]
}

/**
 * Everything that fails the guard between two snapshots `{ testIds, pinned }`; empty for a clean
 * move. Tests added by the move are allowed, so the count may rise.
 */
export function movePrFindings(before, after, floor = TEST_COUNT_FLOOR) {
  return [
    ...testCountFindings(before.testIds.length, after.testIds.length, floor),
    ...missingTestIds(before.testIds, after.testIds),
    ...pinnedFileFindings(before.pinned, after.pinned),
  ]
}

/** The guard's verdict as text: the counts, then one line per finding. */
export function formatMovePrReport(before, after, findings) {
  const head = `Move-PR guard: ${before.testIds.length} tests before, ${after.testIds.length} after; ${Object.keys(after.pinned).length} pinned files`
  if (findings.length === 0) return `${head}\nPASS: a clean move.\n`
  return `${head}\nFAIL: ${findings.length} finding(s)\n${findings.map(describeFinding).join('\n')}\n`
}

function describeFinding(finding) {
  if (finding.kind === 'test-count')
    return `- test count ${finding.after} is below ${Math.max(finding.before, finding.floor)} (before ${finding.before}, floor ${finding.floor})`
  if (finding.kind === 'missing-test-id') return `- test ID gone (${finding.lost}x): ${finding.id}`
  return `- ${finding.kind.replace('pinned-file-', 'pinned file ')}: ${finding.id}`
}
