#!/usr/bin/env node
// `npm run perf:phone` (#470 P1-10, ticket 481): the phone-class perf lane, report only and never
// gated. Runs e2e/browser/mobile/perfPhone.spec.ts on the Pixel 7 Chromium project with the CPU
// throttled 4x and 6x, prints each case's tick cost against the TD's 6 ms target, and records one
// history line per rate with `perf:record --source e2e --env "Chromium CPU throttled Nx,
// SwiftShader"`, so it charts on the Performance tab (docs/perf/README.md). Throttled SwiftShader
// gives tick cost (CPU) numbers only; GPU numbers come from the real-device check (#482).
//
//   npm run perf:phone                      measure, then append the lines; commit history.ndjson
//   npm run perf:phone -- --dry-run         measure and print the lines, write nothing
//   options passed on to perf:record: --dry-run --note "<text>" --load <n> --commit <sha>
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { phoneLaneEnvOf, phoneLaneMetricsOf, tickCostLinesOf } from './phoneLane.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SPEC = 'e2e/browser/mobile/perfPhone.spec.ts'
const PROJECT = 'mobile-chromium-pixel7'
const RESULTS_DIR = join(REPO_ROOT, 'test-results/perf-phone')
const PLAN = JSON.parse(
  readFileSync(join(REPO_ROOT, 'e2e/browser/mobile/perfPhonePlan.json'), 'utf8'),
)

function runLane() {
  const args = ['playwright', 'test', SPEC, '--project', PROJECT, '--reporter', 'list']
  const env = { ...process.env, PERF_PHONE: '1' }
  const run = spawnSync('npx', args, { cwd: REPO_ROOT, env, stdio: 'inherit' })
  if (run.status !== 0) throw new Error(`the phone lane's spec exited ${run.status}`)
}

function readRateFile(rate) {
  return JSON.parse(readFileSync(join(RESULTS_DIR, `cpu${rate}x.json`), 'utf8'))
}

/** Writes the rate's `{metrics}` file and records it under the rate's env. */
function recordRate(rateFile, recordArgs) {
  const metricsFile = join(RESULTS_DIR, `cpu${rateFile.cpuThrottleRate}x.metrics.json`)
  writeFileSync(metricsFile, `${JSON.stringify(phoneLaneMetricsOf(rateFile), null, 2)}\n`)
  const env = phoneLaneEnvOf(rateFile.cpuThrottleRate)
  const args = ['scripts/perf/recordPerf.mjs', '--source', 'e2e', '--from', metricsFile]
  const run = spawnSync(process.execPath, [...args, '--env', env, ...recordArgs], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
  if (run.status !== 0) throw new Error(`perf:record exited ${run.status} for ${env}`)
}

function main(recordArgs) {
  runLane()
  const rateFiles = PLAN.cpuThrottleRates.map(readRateFile)
  for (const rateFile of rateFiles) {
    for (const line of tickCostLinesOf(rateFile, PLAN.tickMsP95Target)) console.log(line)
  }
  for (const rateFile of rateFiles) recordRate(rateFile, recordArgs)
}

try {
  main(process.argv.slice(2))
} catch (err) {
  console.error(`perf:phone: ${err.message}`)
  process.exit(1)
}
