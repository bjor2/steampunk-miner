/**
 * Composition root: wires shell, run log, checkpoint, store and debug API together once at page
 * start.
 * Orchestrates only; each step lives in the module that owns it.
 */
import { BUILD_COMMIT, GAME_VERSION } from './constants/buildInfo'
import { createDebugApi } from './debug/debugApi'
import {
  createFanOutSink,
  createMemorySink,
  createNdjsonSink,
  type FlushableSink,
  type MemorySink,
} from './logging/eventSink'
import { writeRunMetadata, writeRunSummary } from './logging/runDocuments'
import { createRunId } from './logging/runLayout'
import { createRunLog, getRunLog, installRunLog } from './logging/runLog'
import { createRunMetadata } from './logging/runMetadata'
import { getShell, type Shell } from './shell/shell'
import {
  installSaveSlots,
  loadCheckpoint,
  type CheckpointLoad,
  type SaveSlots,
} from './store/checkpoint'
import { runEventPlaceOf, useGameStore } from './store/gameStore'
import { routeKeyChange, routeScrollNotch } from './store/inputRuntime'
import { recordStartingPlanetEntered } from './store/planetArrivalLog'
import { installPreferencesStorage, loadPreferences } from './store/preferencesFile'
import { parseScenario, type Scenario } from './systems/scenario'

const LOG_FLUSH_INTERVAL_MS = 1000

/** The files of the run in progress: the NDJSON sink and the memory copy the summary reads. */
interface RunFiles {
  runId: string
  startedAt: Date
  sink: FlushableSink
  recorded: MemorySink
}

/** Settles once the session is settled: fresh, resumed from the checkpoint, or a scenario's. */
export async function startGame(): Promise<void> {
  const shell = getShell()
  const run = startRunLogging(shell, new Date())
  recordGameStarted(shell)
  installSaveSlots(saveSlotsOf(shell))
  await adoptLocalPreferences(shell)
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
  const recorded = createMemorySink()
  const startedAtMs = performance.now()
  installRunLog(
    createRunLog({
      runId: run.runId,
      sink: createFanOutSink(sink, recorded),
      secondsSinceStart: () => (performance.now() - startedAtMs) / 1000,
    }),
  )
  return { ...run, sink, recorded }
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
    reportFailure(writeRunSummary(shell, run.runId, run.recorded.events))
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
  const { prefs, problems } = await loadPreferences()
  if (problems.length > 0)
    console.error(`preferences refused, using defaults: ${problems.join('; ')}`)
  useGameStore.getState().adoptPreferences(prefs)
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

function exposeDebugHandles(shell: Shell, runId: string): void {
  if (!shell.launch.debugEnabled) return
  shell.exposeGlobalHandle('steampunkDebug', createDebugApi())
  shell.exposeGlobalHandle('steampunkRunLog', () => shell.readBufferedRunEvents(runId))
  shell.exposeGlobalHandle('steampunkRunCommands', () => shell.readBufferedRunCommands(runId))
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
