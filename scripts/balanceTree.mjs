#!/usr/bin/env node
// The tech tree's balance lane (#212, #385): the pacing bot to planet 60 on the three pacing seeds,
// then every guard on its runs. `--milestones` (ticket 278, GD lock on #256) runs only the Mark
// milestone income cap on those runs; Vitest would refuse the flag, so it becomes a name filter
// here. Arguments it does not know go to Vitest.
//
//   npm run balance:tree                    every guard of the lane
//   npm run balance:tree -- --milestones    only the Mark milestone income cap
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const LANE = 'src/features/tech-tree/treeSpendGuard.lane.test.ts'
const MILESTONES_FLAG = '--milestones'
/** The lane's milestone describe names this; no other test of the lane does. */
const MILESTONE_TESTS = 'Mark milestones'

function vitestArgsOf(args) {
  const passed = args.filter((arg) => arg !== MILESTONES_FLAG)
  const filter = args.includes(MILESTONES_FLAG) ? ['-t', MILESTONE_TESTS] : []
  return ['vitest', 'run', LANE, ...filter, ...passed]
}

function main() {
  const args = vitestArgsOf(process.argv.slice(2))
  return spawnSync('npx', args, { cwd: REPO_ROOT, stdio: 'inherit' }).status ?? 1
}

process.exit(main())
