#!/usr/bin/env node
// The move-PR guard (#230, GD lock on #191): compares this checkout with a base ref and fails when a
// test move lowered the test count, dropped or renamed a test ID, or changed a golden, a seed, the
// balance baseline or a Vertical Scaler table. The base is checked out detached in a temporary
// worktree that shares this checkout's node_modules, and removed afterwards.
//
//   npm run tests:move-guard                               against origin/main
//   npm run tests:move-guard -- --base <ref>               against another ref
//   npm run tests:move-guard -- --balance report [...]     also run balance:<name> in both trees
//                                                          and require byte-identical output (long:
//                                                          the box Tester's run, never a worker's)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { formatMovePrReport, movePrFindings } from './movePrGuard.mjs'
import { snapshotTree } from './treeSnapshot.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DEFAULT_BASE = 'origin/main'

function readOptions(args) {
  return {
    base: lastValueOf(args, '--base') ?? DEFAULT_BASE,
    balanceNames: valuesOf(args, '--balance'),
  }
}

function lastValueOf(args, flag) {
  const at = args.lastIndexOf(flag)
  return at === -1 ? undefined : args[at + 1]
}

function valuesOf(args, flag) {
  return args.flatMap((arg, at) => (arg === flag && at + 1 < args.length ? [args[at + 1]] : []))
}

function checkOutBase(base) {
  const root = join(mkdtempSync(join(tmpdir(), 'move-pr-base-')), 'tree')
  execFileSync('git', ['worktree', 'add', '--detach', root, base], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
  })
  symlinkSync(realpathSync(join(REPO_ROOT, 'node_modules')), join(root, 'node_modules'))
  return root
}

function removeBase(root) {
  rmSync(join(root, '..'), { recursive: true, force: true })
  execFileSync('git', ['worktree', 'prune'], { cwd: REPO_ROOT, stdio: 'ignore' })
}

function snapshotBase(base, balanceNames) {
  const root = checkOutBase(base)
  try {
    return snapshotTree(root, balanceNames)
  } finally {
    removeBase(root)
  }
}

function reportVerdict(before, after) {
  const findings = movePrFindings(before, after)
  process.stdout.write(formatMovePrReport(before, after, findings))
  process.exitCode = findings.length === 0 ? 0 : 1
}

function guardMove(args) {
  const { base, balanceNames } = readOptions(args)
  const before = snapshotBase(base, balanceNames)
  const after = snapshotTree(REPO_ROOT, balanceNames)
  return reportVerdict(before, after)
}

guardMove(process.argv.slice(2))
