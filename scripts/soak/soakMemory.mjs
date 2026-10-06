#!/usr/bin/env node
// Memory soak on the preview build in Chromium (#99; perf report /workspace/perf/memory/out/report.md
// sections 3 and 6) or on the packaged Electron build (#102; soakTarget.mjs): drives the vehicle
// through repeated chunk cycles (dock, undock, drive off the pad, drill down, drill sideways both
// ways, back to the dock) and, every 10 s after a forced GC, samples the JS heap, the renderer's
// geometries and textures, the Rapier world's bodies, colliders and WASM memory, the DOM counters
// and the game's frame times; plus one sample per cycle boundary on the dock. Heap snapshots at
// start, middle and end. Then soakGate.mjs judges the boundaries.
//
// The game is read only through its debug API (`?debug`, `--debug-api` in Electron):
// `ui.getRendererMemory()` and `getPhysicsStats()` (#119) for the counts, `ui.getRenderStats()` for
// frame times. Heap, GC and DOM counters come from the renderer (CDP), never from a hook in the page.
//
//   npm run soak:memory     (builds, then a 10-minute soak into test-results/soak)
//   node scripts/soak/soakMemory.mjs [--minutes 10] [--out DIR] [--port 4391] [--dist dist]
//        [--browser /path/to/chrome] [--no-snapshots]
//   xvfb-run -a node scripts/soak/soakMemory.mjs --electron release/linux-unpacked/steampunk-miner
//        [--minutes 10] [--out DIR] [--no-snapshots]   (after `npm run electron:build`)
//   node scripts/soak/soakMemory.mjs --evaluate DIR/soak.json   (re-run the gate offline, print)
//   node scripts/soak/soakMemory.mjs --job-summary DIR   (print DIR/summary.json as a CI job-summary row)
//
// Writes DIR/soak.json (every sample), DIR/summary.json (soakSummary.mjs), DIR/soak-chart.svg
// (soakChart.mjs) and the heap snapshots; exits 1 when the gate fails and 2 when the soak could not run.
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { drawSoakChart } from './soakChart.mjs'
import { formatSoakJobSummary } from './soakJobSummary.mjs'
import { isGameMemoryReadable, readGameMemory, refillOnDock } from './soakPage.mjs'
import { summariseSoak } from './soakSummary.mjs'
import { openBrowserTarget, openElectronTarget } from './soakTarget.mjs'

const SAMPLE_EVERY_MS = 10_000
const SETTLE_MS = 3_000
const MIB = 1048576
/** The cycle that streams chunks (perf report section 3): from the dock, out, down, both ways. */
const CYCLE_LEGS = [
  ['aim_right', 8_000],
  ['aim_down', 8_000],
  ['aim_left', 4_000],
  ['aim_right', 4_000],
]
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const log = (...parts) => console.log(new Date().toISOString(), ...parts)

function readSoakOptions(argv) {
  const valueOf = (name, fallback) => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? fallback : argv[at + 1]
  }
  return {
    minutes: Number(valueOf('minutes', '10')),
    port: Number(valueOf('port', '4391')),
    out: resolve(valueOf('out', 'test-results/soak')),
    dist: valueOf('dist', 'dist'),
    browserPath: valueOf('browser', undefined),
    electronPath: valueOf('electron', undefined),
    isTakingSnapshots: !argv.includes('--no-snapshots'),
    evaluate: valueOf('evaluate', null),
    jobSummary: valueOf('job-summary', null),
  }
}

async function openGame(target) {
  const { page } = target
  const errors = { pageErrors: [], consoleErrors: [] }
  page.on('pageerror', (error) => errors.pageErrors.push(String(error.stack ?? error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.consoleErrors.push(message.text())
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  await target.startGame()
  await waitForMemoryReads(page)
  return { page, cdp, errors }
}

/** Waits for the scene to mount, then lets the first chunks settle before the start snapshot. */
async function waitForMemoryReads(page) {
  await page.waitForFunction(isGameMemoryReadable, null, { timeout: 120_000 })
  await sleep(5_000)
}

async function collectGarbage({ cdp, page }) {
  await cdp.send('HeapProfiler.collectGarbage')
  await page.evaluate(() => globalThis.gc?.())
  await cdp.send('HeapProfiler.collectGarbage')
}

async function sampleNow(session, label) {
  await collectGarbage(session)
  const game = await session.page.evaluate(readGameMemory)
  const dom = await session.cdp.send('Memory.getDOMCounters')
  return {
    ...label,
    ...game,
    domNodes: dom.nodes,
    jsEventListeners: dom.jsEventListeners,
  }
}

async function takeHeapSnapshot(session, file) {
  const stream = createWriteStream(file)
  const writeChunk = ({ chunk }) => stream.write(chunk)
  session.cdp.on('HeapProfiler.addHeapSnapshotChunk', writeChunk)
  await session.cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  session.cdp.off('HeapProfiler.addHeapSnapshotChunk', writeChunk)
  await new Promise((done) => stream.end(done))
}

function describeSample(sample) {
  const heap = (sample.usedJSHeapSize / MIB).toFixed(1)
  return `cycle=${sample.cycle} heap=${heap}MB geo=${sample.geometries} tex=${sample.textures} bodies=${sample.rapierBodies} colliders=${sample.rapierColliders} p95=${sample.gameFrameP95Ms?.toFixed(1)}ms`
}

async function hold(page, actionId, ms) {
  await page.evaluate((id) => globalThis.steampunkDebug.input.press(id), actionId)
  await sleep(ms)
  await page.evaluate((id) => globalThis.steampunkDebug.input.release(id), actionId)
}

async function driveOneCycle(session, results) {
  results.refusals.push(...(await session.page.evaluate(refillOnDock)))
  await sleep(SETTLE_MS)
  // The dock screen's cancel undocks (dockRules.ts); a docked vehicle ignores the aim actions.
  await session.page.evaluate(() => globalThis.steampunkDebug.input.tap('ui_cancel'))
  await sleep(500)
  for (const [actionId, ms] of CYCLE_LEGS) await hold(session.page, actionId, ms)
}

/** Serialises CDP work: a periodic sample never interleaves with a boundary or a snapshot. */
function createSoakClock(session, results, options) {
  const startedAt = Date.now()
  let queue = Promise.resolve()
  const clock = {
    startedAt,
    cycle: 0,
    elapsedS: () => (Date.now() - startedAt) / 1000,
    exclusive: (work) => (queue = queue.then(work, work)),
    drained: () => queue,
  }
  clock.snapshot = (label) =>
    clock.exclusive(() => takeLabelledSnapshot(session, results, options, clock, label))
  return clock
}

async function takeLabelledSnapshot(session, results, options, clock, label) {
  if (!options.isTakingSnapshots) return
  await collectGarbage(session)
  const file = join(options.out, `heap-${label}.heapsnapshot`)
  await takeHeapSnapshot(session, file)
  results.snapshots.push({ label, file, t: clock.elapsedS(), cycle: clock.cycle })
  log('snapshot', label)
}

function startPeriodicSampling(session, results, clock) {
  return setInterval(() => {
    clock
      .exclusive(async () => {
        const label = { t: clock.elapsedS(), cycle: clock.cycle, kind: 'periodic' }
        const sample = await sampleNow(session, label)
        results.samples.push(sample)
        log(`t=${sample.t.toFixed(0)}s`, describeSample(sample))
      })
      .catch((error) => log('sample failed', error))
  }, SAMPLE_EVERY_MS)
}

/** Back on the dock and settled, so every boundary sees the same chunks. */
async function sampleBoundary(session, results, clock) {
  await session.page.evaluate(() => globalThis.steampunkDebug.teleportToDock())
  await sleep(SETTLE_MS)
  await clock.exclusive(async () => {
    const label = { t: clock.elapsedS(), cycle: clock.cycle, kind: 'boundary' }
    const boundary = await sampleNow(session, label)
    results.boundaries.push(boundary)
    log('boundary', describeSample(boundary))
  })
}

async function driveCycles(session, options) {
  const results = { refusals: [], samples: [], boundaries: [], snapshots: [] }
  const clock = createSoakClock(session, results, options)
  const halfway = clock.startedAt + (options.minutes * 60_000) / 2
  const deadline = clock.startedAt + options.minutes * 60_000
  const sampler = startPeriodicSampling(session, results, clock)
  await clock.snapshot('start')
  let isMidTaken = false
  while (Date.now() < deadline) {
    await driveOneCycle(session, results)
    clock.cycle++
    await sampleBoundary(session, results, clock)
    if (!isMidTaken && Date.now() > halfway) {
      isMidTaken = true
      await clock.snapshot('mid')
    }
  }
  clearInterval(sampler)
  await clock.drained()
  await clock.snapshot('end')
  return { startedAt: new Date(clock.startedAt).toISOString(), ...results }
}

async function writeSoakRun(session, options, driven) {
  const run = {
    target: session.target,
    startedAt: driven.startedAt,
    minutes: options.minutes,
    cycleLegs: CYCLE_LEGS,
    userAgent: await session.page.evaluate(() => navigator.userAgent),
    pageErrors: session.errors.pageErrors,
    consoleErrors: session.errors.consoleErrors.slice(0, 50),
    consoleErrorCount: session.errors.consoleErrors.length,
    ...driven,
    refusals: [...driven.refusals, ...driven.samples.flatMap((sample) => sample.refusals)],
  }
  writeFileSync(join(options.out, 'soak.json'), JSON.stringify(run, null, 1))
  writeFileSync(join(options.out, 'soak-chart.svg'), drawSoakChart(run))
  return writeSummary(options.out, run)
}

function writeSummary(dir, run) {
  const summary = summariseSoak(run)
  writeFileSync(join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  return summary
}

function reportVerdict(summary) {
  log(
    `${summary.cycles} cycles, heap ${summary.heapFirstBoundaryMB} -> ${summary.heapLastBoundaryMB} MB`,
  )
  log(summary.gate === 'PASS' ? 'PASS' : `FAIL\n  ${summary.failures.join('\n  ')}`)
  return summary.gate === 'PASS' ? 0 : 1
}

function openTarget(options) {
  return options.electronPath ? openElectronTarget(options) : openBrowserTarget(options)
}

async function runSoak(options) {
  mkdirSync(options.out, { recursive: true })
  const target = await openTarget(options)
  try {
    const session = { target: target.kind, ...(await openGame(target)) }
    const driven = await driveCycles(session, options)
    return reportVerdict(await writeSoakRun(session, options, driven))
  } finally {
    await target.close()
  }
}

/** Prints the summary of a saved soak.json and its gate verdict; writes nothing. */
function evaluateSavedRun(file) {
  const summary = summariseSoak(JSON.parse(readFileSync(file, 'utf8')))
  console.log(JSON.stringify(summary, null, 2))
  return reportVerdict(summary)
}

/** Prints the job-summary Markdown of DIR/summary.json, a FAIL line when the soak never wrote one. */
function printJobSummary(dir) {
  const file = join(dir, 'summary.json')
  const summary = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  process.stdout.write(formatSoakJobSummary(summary))
  return 0
}

async function main(argv) {
  const options = readSoakOptions(argv)
  if (options.evaluate) return evaluateSavedRun(options.evaluate)
  if (options.jobSummary) return printJobSummary(options.jobSummary)
  return runSoak(options)
}

main(process.argv.slice(2)).then(
  (exitCode) => process.exit(exitCode),
  (error) => {
    console.error(error)
    process.exit(2)
  },
)
