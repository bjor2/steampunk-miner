/**
 * Composition root: wires shell, run log, store and debug API together once at page start.
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
import { runEventPlaceOf, useGameStore } from './store/gameStore'
import { recordStartingPlanetEntered } from './store/planetArrivalLog'
import { parseScenario, type Scenario } from './systems/scenario'

const LOG_FLUSH_INTERVAL_MS = 1000

/** The files of the run in progress: the NDJSON sink and the memory copy the summary reads. */
interface RunFiles {
  runId: string
  startedAt: Date
  sink: FlushableSink
  recorded: MemorySink
}

export function startGame(): void {
  const shell = getShell()
  const run = startRunLogging(shell, new Date())
  recordGameStarted(shell)
  recordStartingPlanetEntered()
  keepRunFilesWritten(shell, run)
  exposeDebugHandles(shell, run.runId)
  applyLaunchScenario(shell)
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
