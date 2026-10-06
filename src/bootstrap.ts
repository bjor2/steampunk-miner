/**
 * Composition root: loads the feature slices, then wires shell, run log, checkpoint, store and
 * debug API together once at page start.
 * Orchestrates only; each step lives in the module that owns it.
 */
import { BUILD_COMMIT, GAME_VERSION } from './constants/buildInfo'
import { createDebugApi } from './debug/debugApi'
import { loadFeatures } from './features'
import {
  createFanOutSink,
  createNdjsonSink,
  createSummarySink,
  type FlushableSink,
  type SummarySink,
} from './logging/eventSink'
import { writeRunMetadata, writeRunSummary } from './logging/runDocuments'
import { createRunId } from './logging/runLayout'
import { createRunLog, getRunLog, installRunLog } from './logging/runLog'
import { createRunMetadata } from './logging/runMetadata'
import { createRunProgressSink, type RunProgressSink } from './logging/runProgress'
import { watchRapierWasmMemory } from './physics/rapierWasmMemory'
import { getShell, type Shell } from './shell/shell'
import {
  installSaveSlots,
  loadCheckpoint,
  type CheckpointLoad,
  type SaveSlots,
} from './store/checkpoint'
import { runEventPlaceOf, useGameStore } from './store/gameStore'
import { routeKeyChange, routeScrollNotch } from './store/inputRuntime'
import { turnOnPerfLog } from './store/perfLog'
import { recordStartingPlanetEntered } from './store/planetArrivalLog'
import { installPreferencesStorage, loadPreferences } from './store/preferencesFile'
import { parseScenario, type Scenario } from './systems/scenario'
import { keepScreenFitted } from './ui/stage/screenFit'

const LOG_FLUSH_INTERVAL_MS = 1000

/**
 * The files of the run in progress: the NDJSON sink and the summary folded as the run goes, and
 * the progress the memory samples carry (#121).
 */
interface RunFiles {
  runId: string
  startedAt: Date
  sink: FlushableSink
  summary: SummarySink
  progress: RunProgressSink
}

/** Settles once the session is settled: fresh, resumed from the checkpoint, or a scenario's. */
export async function startGame(): Promise<void> {
  loadFeatures()
  const shell = getShell()
  const run = startRunLogging(shell, new Date())
  logPerfOnTestRuns(shell, run)
  recordGameStarted(shell)
  installSaveSlots(saveSlotsOf(shell))
  await adoptLocalPreferences(shell)
  keepScreenFitted(shell)
  shell.onKeyChange(routeKeyChange)
  shell.onScrollNotch(routeScrollNotch)
  await resumeLastCheckpoint(shell)
  recordStartingPlanetEntered()
  keepRunFilesWritten(shell, run)
  exposeDebugHandles(shell, run.runId)
  applyLaunchScenario(shell)
  startHints()
  writeMetadata(shell, run)
}

function startRunLogging(shell: Shell, startedAt: Date): RunFiles {
  const run = { runId: createRunId(startedAt), startedAt }
  const sink = createNdjsonSink(shell)
  const summary = createSummarySink()
  const progress = createRunProgressSink()
  const startedAtMs = performance.now()
  installRunLog(
    createRunLog({
      runId: run.runId,
      sink: createFanOutSink(sink, summary, progress),
      secondsSinceStart: () => (performance.now() - startedAtMs) / 1000,
    }),
  )
  return { ...run, sink, summary, progress }
}

function recordGameStarted(shell: Shell): void {
  // A run starts at authority tick 0, before any command.
  getRunLog().record({ ...runEventPlaceOf(useGameStore.getState()), tick: 0 }, 'game_started', {
    gameVersion: GAME_VERSION,
    buildCommit: BUILD_COMMIT,
    platform: shell.kind,
    debug: shell.launch.debugEnabled,
  })
}

/** Lines flush every second; the summary and metadata are rewritten when the page hides. */
function keepRunFilesWritten(shell: Shell, run: RunFiles): void {
  const flush = () => reportFailure(run.sink.flush())
  setInterval(flush, LOG_FLUSH_INTERVAL_MS)
  shell.onPageHide(() => {
    flush()
    reportFailure(writeRunSummary(shell, run.runId, run.summary.summarize()))
    writeMetadata(shell, run)
  })
}

function saveSlotsOf(shell: Shell): SaveSlots {
  return {
    write: (slot, json) => shell.writeSaveSlot(slot, json),
    read: (slot) => shell.readSaveSlot(slot),
    setAside: (slot) => shell.setAsideSaveSlot(slot),
  }
}

/** Settings and rebinding (#33) from the local file; a refused file keeps the defaults. */
async function adoptLocalPreferences(shell: Shell): Promise<void> {
  installPreferencesStorage({
    read: () => shell.readPreferences(),
    write: (json) => shell.writePreferences(json),
  })
  const reading = await loadPreferences()
  if (reading.problems.length > 0)
    console.error(`preferences refused, using defaults: ${reading.problems.join('; ')}`)
  useGameStore.getState().adoptPreferences(reading)
}

/** Quit and resume (#26); a launch scenario sets its own start instead. */
async function resumeLastCheckpoint(shell: Shell): Promise<void> {
  if (shell.launch.scenarioText !== null) return
  resumeOrReport(await loadCheckpoint())
}

function resumeOrReport(checkpoint: CheckpointLoad): void {
  if (checkpoint === null) return
  if ('state' in checkpoint) useGameStore.getState().resumeCheckpoint(checkpoint)
  else console.error(`checkpoint refused, starting fresh: ${checkpoint.problems.join('; ')}`)
}

/** Before the scene mounts, so `getPhysicsStats()` sees Rapier's WASM memory as it loads (#119). */
function exposeDebugHandles(shell: Shell, runId: string): void {
  if (!shell.launch.debugEnabled) return
  watchRapierWasmMemory()
  shell.exposeGlobalHandle('steampunkDebug', createDebugApi())
  shell.exposeGlobalHandle('steampunkRunLog', () => shell.readBufferedRunEvents(runId))
  shell.exposeGlobalHandle('steampunkRunCommands', () => shell.readBufferedRunCommands(runId))
}

/**
 * `perf` lines are for dev, scenario and debug runs only (#11 section 1, #38). Their memory sample
 * (#121) needs Rapier's WASM memory and the page's listeners watched before anything registers
 * one, so this runs first.
 */
function logPerfOnTestRuns(shell: Shell, run: RunFiles): void {
  const isTestRun = shell.launch.debugEnabled || shell.launch.scenarioText !== null
  if (!isTestRun && !import.meta.env.DEV) return
  watchRapierWasmMemory()
  shell.watchPageListeners()
  turnOnPerfLog({
    readPageMemory: () => shell.readPageMemory(),
    readRunProgress: () => run.progress.progress(),
  })
}

function applyLaunchScenario(shell: Shell): void {
  const text = shell.launch.scenarioText
  if (text === null) return
  const { scenario, problems } = parseScenario(text)
  if (problems.length > 0) throw new Error(`launch scenario refused: ${problems.join('; ')}`)
  useGameStore.getState().applyScenario(scenario as Scenario)
}

/** The run has started (#16): the opening transmission and `hint_move` go up unless seen. */
function startHints(): void {
  useGameStore.getState().startPlaques()
}

function writeMetadata(shell: Shell, run: RunFiles): void {
  const game = useGameStore.getState()
  const metadata = createRunMetadata({
    runId: run.runId,
    gameVersion: GAME_VERSION,
    buildCommit: BUILD_COMMIT,
    worldSeed: game.planetSeed,
    platform: shell.kind,
    debugEnabled: shell.launch.debugEnabled,
    debugApplied: game.debugApplied,
    players: 1,
    startTime: run.startedAt.toISOString(),
    endTime: null,
  })
  reportFailure(writeRunMetadata(shell, metadata))
}

function reportFailure(write: Promise<void>): void {
  void write.catch((error) => console.error('run file write failed', error))
}
