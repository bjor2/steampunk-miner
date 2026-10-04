/**
 * Composition root: wires shell, run log, store and debug API together once at page start.
 * Orchestrates only; each step lives in the module that owns it.
 */
import { BUILD_COMMIT, GAME_VERSION } from './constants/buildInfo'
import { createDebugApi } from './debug/debugApi'
import { createNdjsonSink, type FlushableSink } from './logging/eventSink'
import { createRunId } from './logging/runLayout'
import { createRunLog, getRunLog, installRunLog } from './logging/runLog'
import type { RunMetadata } from './logging/runMetadata'
import { getShell, type Shell } from './shell/shell'
import { runEventPlaceOf, useGameStore } from './store/gameStore'
import { parseStartScenario } from './systems/startScenario'

const LOG_FLUSH_INTERVAL_MS = 1000

export function startGame(): void {
  const shell = getShell()
  const startedAt = new Date()
  const runId = createRunId(startedAt)
  const sink = startRunLogging(shell, runId)
  recordGameStarted(shell)
  keepLogFlushed(shell, sink)
  exposeDebugHandles(shell, runId)
  applyLaunchScenario(shell)
  writeRunMetadata(shell, runId, startedAt)
}

function startRunLogging(shell: Shell, runId: string): FlushableSink {
  const sink = createNdjsonSink(shell)
  const startedAtMs = performance.now()
  installRunLog(
    createRunLog({
      runId,
      sink,
      secondsSinceStart: () => (performance.now() - startedAtMs) / 1000,
    }),
  )
  return sink
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

function keepLogFlushed(shell: Shell, sink: FlushableSink): void {
  const flush = () =>
    void sink.flush().catch((error) => console.error('run log flush failed', error))
  setInterval(flush, LOG_FLUSH_INTERVAL_MS)
  shell.onPageHide(flush)
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
  const { scenario, problems } = parseStartScenario(text)
  if (problems.length > 0) throw new Error(`launch scenario refused: ${problems.join('; ')}`)
  useGameStore.getState().applyStartScenario(scenario)
}

function writeRunMetadata(shell: Shell, runId: string, startedAt: Date): void {
  const metadata: RunMetadata = {
    runId,
    gameVersion: GAME_VERSION,
    buildCommit: BUILD_COMMIT,
    worldSeed: useGameStore.getState().planetSeed,
    difficulty: 'normal',
    multiplayer: false,
    players: 1,
    startTime: startedAt.toISOString(),
    endTime: null,
    durationSeconds: null,
  }
  void shell.writeRunDocument(runId, 'metadata', JSON.stringify(metadata, null, 2))
}
