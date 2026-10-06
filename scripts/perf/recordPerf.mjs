#!/usr/bin/env node
// Appends one measurement run to docs/perf/history.ndjson for a commit (HEAD by default), so the
// Performance section of /status/ charts it after the next Pages build. See docs/perf/README.md.
//
//   npm run perf:record -- --source bench [--runs 5] [--benches world,render,ground,combat]
//   npm run perf:record -- --source soak --from <soak/summary.json> --from <soak/soak.json>
//   options: --commit <sha> --measured-at <iso> --env "<note>" --load <n> --note "<text>"
//            --history <path> --dry-run
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  medianMetricsOf,
  medianOf,
  metricsOfBenchLine,
  metricsOfMeasurementFile,
} from './perfMetrics.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCES = ['bench', 'soak', 'e2e', 'ci', 'manual', 'analysis']
const DEFAULT_BENCHES = ['world', 'render', 'ground', 'combat']

function readOptions(argv) {
  const options = { from: [], runs: 5, benches: DEFAULT_BENCHES, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = () => {
      if (argv[i + 1] === undefined) throw new Error(`${flag} needs a value`)
      return argv[++i]
    }
    if (flag === '--source') options.source = value()
    else if (flag === '--from') options.from.push(value())
    else if (flag === '--runs') options.runs = Number.parseInt(value(), 10)
    else if (flag === '--benches') options.benches = value().split(',').filter(Boolean)
    else if (flag === '--commit') options.commit = value()
    else if (flag === '--measured-at') options.measuredAt = value()
    else if (flag === '--env') options.env = value()
    else if (flag === '--load') options.load = Number(value())
    else if (flag === '--note') options.note = value()
    else if (flag === '--history') options.history = value()
    else if (flag === '--dry-run') options.dryRun = true
    else throw new Error(`unknown option ${flag}`)
  }
  return options
}

function checkOptions(options) {
  if (!SOURCES.includes(options.source)) {
    throw new Error(`--source must be one of ${SOURCES.join('|')}`)
  }
  if (options.source !== 'bench' && options.from.length === 0) {
    throw new Error(`--source ${options.source} needs at least one --from <file>`)
  }
  if (!(options.runs >= 1)) throw new Error('--runs must be a positive integer')
  if (options.load !== undefined && !Number.isFinite(options.load)) {
    throw new Error('--load must be a number')
  }
}

function git(...args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

function commitOf(ref) {
  return {
    commit: git('rev-parse', `${ref}^{commit}`),
    committedAt: git('show', '-s', '--format=%cI', ref),
  }
}

function hasUncommittedChanges() {
  return git('status', '--porcelain', '--untracked-files=no') !== ''
}

function describeMachine() {
  const cores = cpus()
  return `${cores.length} vCPU ${cores[0]?.model ?? 'unknown CPU'}, node ${process.version}, ${process.platform}`
}

function runBenchOnce(bench) {
  const run = spawnSync('npm', ['run', '--silent', `bench:${bench}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 << 20,
  })
  if (run.status !== 0) throw new Error(`bench:${bench} exited ${run.status}: ${run.stderr}`)
  const lines = run.stdout.split('\n').filter((l) => l.trim().startsWith('{'))
  if (lines.length === 0) throw new Error(`bench:${bench} printed no JSON line`)
  return Object.assign({}, ...lines.map((l) => metricsOfBenchLine(JSON.parse(l))))
}

// Interleaved (world, render, ground, combat) x runs, so every bench sees the same machine noise
// (benchmark-checklist); the 1-minute load average is sampled before each bench.
function measureBenches(options) {
  const runs = []
  const loads = []
  for (let run = 1; run <= options.runs; run++) {
    const metrics = {}
    for (const bench of options.benches) {
      loads.push(loadavg()[0])
      Object.assign(metrics, runBenchOnce(bench))
      console.error(
        `run ${run}/${options.runs} bench:${bench} done (load ${loads.at(-1).toFixed(2)})`,
      )
    }
    runs.push(metrics)
  }
  return { metrics: medianMetricsOf(runs), load: Math.round(medianOf(loads) * 100) / 100 }
}

function readMeasurementFiles(paths) {
  const metrics = {}
  for (const path of paths) {
    const { kind, metrics: found } = metricsOfMeasurementFile(
      JSON.parse(readFileSync(path, 'utf8')),
    )
    console.error(`${path}: ${kind}, ${Object.keys(found).length} metrics`)
    Object.assign(metrics, found)
  }
  return metrics
}

function measure(options) {
  const fromFiles = readMeasurementFiles(options.from)
  if (options.source !== 'bench' || options.from.length > 0) return { metrics: fromFiles }
  return measureBenches(options)
}

function checkMeasuredMetrics(metrics) {
  const ids = Object.keys(metrics)
  if (ids.length === 0) throw new Error('no metrics measured')
  const notNumbers = ids.filter((id) => !Number.isFinite(metrics[id]))
  if (notNumbers.length > 0) throw new Error(`not finite numbers: ${notNumbers.join(', ')}`)
}

function historyEntryOf(options, measured, commit) {
  const load = options.load ?? measured.load
  return {
    commit: commit.commit,
    committedAt: commit.committedAt,
    measuredAt: options.measuredAt ?? new Date().toISOString(),
    source: options.source,
    machine: describeMachine(),
    ...(options.env ? { env: options.env } : {}),
    ...(load === undefined ? {} : { load }),
    ...(options.source === 'bench' && options.from.length === 0 ? { runs: options.runs } : {}),
    ...(options.note ? { note: options.note } : {}),
    metrics: measured.metrics,
  }
}

function appendHistoryLine(path, entry) {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const separator = text === '' || text.endsWith('\n') ? '' : '\n'
  appendFileSync(path, `${separator}${JSON.stringify(entry)}\n`)
}

function recordPerf(argv) {
  const options = readOptions(argv)
  checkOptions(options)
  const commit = commitOf(options.commit ?? 'HEAD')
  if (!options.commit && hasUncommittedChanges()) {
    console.error('warning: uncommitted changes; the numbers are attributed to HEAD as committed')
  }
  const measured = measure(options)
  checkMeasuredMetrics(measured.metrics)
  const entry = historyEntryOf(options, measured, commit)
  const history = options.history ?? join(REPO_ROOT, 'docs/perf/history.ndjson')
  if (!options.dryRun) appendHistoryLine(history, entry)
  console.log(JSON.stringify(entry, null, 2))
  console.error(options.dryRun ? 'dry run: nothing written' : `appended to ${history}; commit it`)
}

try {
  recordPerf(process.argv.slice(2))
} catch (err) {
  console.error(`perf:record: ${err.message}`)
  process.exit(1)
}
