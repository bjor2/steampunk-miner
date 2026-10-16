// The frame-cost A/B of the packaged Electron soak (ticket 526; bar and view in frameAb.mjs): the
// same ore-heavy view in two packaged builds, look off (the merge-base build) and look on (the
// #450/#451 branch tip), alternated off, on, off, on so drift on the machine falls on both. Each
// round launches the build fresh, holds the view still, samples the game's frame p50 once a second
// and counts the shader programs linked while it holds. Reached through soakMemory.mjs:
//
//   xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/soak/soakMemory.mjs \
//     --electron <look-on build> --frame-ab <look-off build> [--gpu] [--rounds 2] [--hold 60]
//     [--out test-results/soak-frame-ab] [--phone-reading "<line from #482>"]
//
// Writes DIR/frame-ab.json (`{"metrics": ...}` for perf:record, plus the summary and every round)
// and prints the report; exits 1 when a real-GPU run misses the bar, 0 on a pass or a dry run.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FRAME_AB_VIEW,
  formatFrameAbReport,
  metricsOfFrameAb,
  summariseFrameAb,
} from './frameAb.mjs'
import {
  enterPlanet,
  holdOreView,
  readFrameSample,
  readProgramLinks,
  readRendererName,
  startCountingProgramLinks,
} from './soakFrameAbPage.mjs'
import { isGameMemoryReadable } from './soakPage.mjs'
import {
  FRAME_AB_GPU_SWITCHES,
  FRAME_AB_SWIFTSHADER_SWITCHES,
  openElectronTarget,
} from './soakTarget.mjs'

const SAMPLE_EVERY_MS = 1_000
/** Long enough for the planet change to land and the band's chunks to stream and compile. */
const PLANET_SETTLE_MS = 3_000
const VIEW_SETTLE_MS = 15_000
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const log = (...parts) => console.log(new Date().toISOString(), ...parts)

export function readFrameAbOptions(argv) {
  const valueOf = (name, fallback) => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? fallback : argv[at + 1]
  }
  return {
    rounds: Number(valueOf('rounds', '2')),
    holdSeconds: Number(valueOf('hold', '60')),
    isOnRealGpu: argv.includes('--gpu'),
    phoneReading: valueOf('phone-reading', undefined),
  }
}

/** Both builds, alternated, into DIR/frame-ab.json; the exit code is the verdict's. */
export async function runFrameAb(options) {
  mkdirSync(options.out, { recursive: true })
  const measured = await measureAlternatedRounds(options)
  const summary = summariseFrameAb(measured)
  writeFrameAbRun(options, summary, measured)
  printFrameAbReport(options, summary)
  return summary.verdict === 'FAIL' ? 1 : 0
}

async function measureAlternatedRounds(options) {
  const measured = { off: [], on: [], renderer: null }
  const builds = { off: options.frameAb, on: options.electronPath }
  for (let round = 1; round <= options.rounds; round++) {
    for (const side of ['off', 'on']) {
      log(`round ${round}/${options.rounds}, look ${side}: ${builds[side]}`)
      const result = await measureRound(builds[side], options)
      measured[side].push(result.round)
      measured.renderer ??= result.renderer
    }
  }
  return measured
}

async function measureRound(executablePath, options) {
  const switches = options.isOnRealGpu ? FRAME_AB_GPU_SWITCHES : FRAME_AB_SWIFTSHADER_SWITCHES
  const target = await openElectronTarget({ electronPath: executablePath, switches })
  try {
    await enterOreView(target)
    return {
      round: await sampleHeldView(target.page, options),
      renderer: await target.page.evaluate(readRendererName),
    }
  } finally {
    await target.close()
  }
}

async function enterOreView(target) {
  const { page } = target
  await page.waitForFunction(isGameMemoryReadable, null, { timeout: 120_000 })
  await target.resizeContent({ width: FRAME_AB_VIEW.width, height: FRAME_AB_VIEW.height })
  refuseProblems(await page.evaluate(enterPlanet, FRAME_AB_VIEW.planetIndex))
  await sleep(PLANET_SETTLE_MS)
  refuseProblems(await page.evaluate(holdOreView, FRAME_AB_VIEW))
  await sleep(VIEW_SETTLE_MS)
}

function refuseProblems(problems) {
  if (problems.length > 0) throw new Error(`the debug API refused the view: ${problems.join('; ')}`)
}

/** Once a second for the hold: the last full second's p50; links counted from the hold's start. */
async function sampleHeldView(page, options) {
  await page.evaluate(startCountingProgramLinks)
  const samples = []
  for (let second = 0; second < options.holdSeconds; second++) {
    await sleep(SAMPLE_EVERY_MS)
    samples.push(await page.evaluate(readFrameSample))
  }
  return {
    frameP50sMs: samples.map((sample) => sample.frameP50Ms),
    programsLinked: await page.evaluate(readProgramLinks),
    viewport: samples.at(-1).viewport,
  }
}

function writeFrameAbRun(options, summary, measured) {
  const run = { metrics: metricsOfFrameAb(summary), summary, builds: buildsOf(options), measured }
  writeFileSync(join(options.out, 'frame-ab.json'), `${JSON.stringify(run, null, 1)}\n`)
}

function buildsOf(options) {
  return { off: options.frameAb, on: options.electronPath, isOnRealGpu: options.isOnRealGpu }
}

function printFrameAbReport(options, summary) {
  for (const line of formatFrameAbReport(summary, options.phoneReading)) log(line)
  log(`record: ${recordCommandOf(options, summary)}`)
}

/** The perf:record line for this run; the commit is the look-on build's, filled in by hand. */
function recordCommandOf(options, summary) {
  const label = summary.isGpuMeasurement ? summary.renderer : `${summary.renderer}; not GPU numbers`
  const env = `frame A/B (ticket 526), packaged Electron, ${label}`
  return `npm run perf:record -- --source soak --from ${join(options.out, 'frame-ab.json')} --commit <look-on sha> --env "${env}"`
}
