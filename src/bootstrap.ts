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
import { createRunMetadata, runFlagFieldsOf } from './logging/runMetadata'
import { createRunProgressSink, type RunProgressSink } from './logging/runProgress'
import { watchRapierWasmMemory } from './physics/rapierWasmMemory'
import { requestCanvasScreenshot } from './scene/canvasScreenshots'
import { renderPointerPresence } from './scene/renderQualityPresence'
import { forgetDevFlagOverrides, isDevFlagSession } from './shell/devFlagStorage'
import { getShell, type Shell } from './shell/shell'
import { onSoundUnlockChange } from './shell/soundOut'
import {
  installSaveFolder,
  loadCheckpoint,
  saveFileNow,
  type Checkpoint,
  type CheckpointLoad,
  type SaveFolderInstall,
} from './store/checkpoint'
import { readAuthorityState } from './store/authorityLink'
import { runEventPlaceOf, useGameStore } from './store/gameStore'
import type { SaveFolder } from './store/saveFolder'
import { installSaveTransfer } from './store/saveKeepingSlice'
import { installDevFlagStorage } from './store/devFlagSlice'
import { installDebugSessionEntry } from './store/devFlagPanelSlice'
import { listenForDomainEvents } from './store/domainEventBroadcast'
import { routeKeyChange, routeScrollNotch } from './store/inputRuntime'
import { routePadFrame } from './store/padRuntime'
import { turnOnPerfLog } from './store/perfLog'
import { recordStartingPlanetEntered } from './store/planetArrivalLog'
import { installPreferencesStorage, loadPreferences } from './store/preferencesFile'
import {
  snapshotPlanetChange,
  snapshotSaveAtSessionEnd,
  turnOnSnapshots,
  type SnapshotSources,
} from './store/runSnapshots'
import { parseScenario, type Scenario } from './systems/scenario'
import { keepScreenFitted } from './ui/stage/screenFit'
import { keepHapticsPlaying, showTouchControlsOnTouch } from './ui/touch/touchFollowers'

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

/**
 * Settles once the session is settled: fresh, resumed from the checkpoint, or a scenario's; or
 * once the title menu is open over a held game, which starts play itself (ticket 403).
 */
export async function startGame(): Promise<void> {
  loadFeatures()
  const shell = getShell()
  const run = startRunLogging(shell, new Date())
  logPerfOnTestRuns(shell, run)
  keepSnapshotsOnDebugRuns(shell, run.runId)
  recordGameStarted(shell)
  installSaveFolder(saveFolderInstallOf(shell))
  keepSavesOnThisDevice(shell)
  await adoptLocalPreferences(shell)
  forgetDevFlagsOnNoFlagsLaunch(shell)
  readDevFlagOverridesInDebugSession(shell)
  offerDebugSessionByGesture(shell)
  keepScreenFitted(shell)
  noteRenderPointer(shell)
  showTouchControlsOnTouch(shell)
  holdPlayWhilePageHidden(shell)
  showWhetherSoundPlays()
  keepHapticsPlaying(shell)
  shell.onKeyChange(routeKeyChange)
  shell.onScrollNotch(routeScrollNotch)
  shell.onPadFrame(routePadFrame)
  await openTitleOrResume(shell)
  keepRunFilesWritten(shell, run)
  exposeDebugHandles(shell, run.runId)
  applyLaunchScenario(shell)
  startHintsUnlessOnTitle()
  writeMetadata(shell, run)
}

/**
 * The render quality's device default (ticket 477: a coarse pointer draws #173's phone cuts) reads
 * the primary pointer as the game starts, before the scene mounts.
 */
function noteRenderPointer(shell: Shell): void {
  renderPointerPresence.isCoarsePointer = shell.readScreen().isCoarsePointer
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

/**
 * The title menu, which starts play once the player picks a game (ticket 403); else, as before
 * it, the autosave resumes and the starting planet's lines and card follow.
 */
async function openTitleOrResume(shell: Shell): Promise<void> {
  if (shell.launch.isTitleMenuShown) return useGameStore.getState().openTitleMenu()
  await resumeLastCheckpointOrStartFresh(shell)
  recordStartingPlanetEntered()
  showStartingPlanetCard()
}

/** The card of the planet the run starts on, opened with its `planet_entered` (ticket 343). */
function showStartingPlanetCard(): void {
  useGameStore.getState().openPlanetCard()
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

/**
 * Lines flush every second, each open drill span's first (ticket 420); the summary and metadata
 * are rewritten when the page hides.
 */
function keepRunFilesWritten(shell: Shell, run: RunFiles): void {
  const flush = () => {
    getRunLog().flushDrillSpans()
    reportFailure(run.sink.flush())
  }
  setInterval(flush, LOG_FLUSH_INTERVAL_MS)
  shell.onPageHide(() => {
    flush()
    reportFailure(writeRunSummary(shell, run.runId, run.summary.summarize()))
    writeMetadata(shell, run)
  })
}

/**
 * A phone's app switch or a background tab stands the step still until the player is back and
 * taps or presses (#470 P1-1, ticket 472): rAF already stops while hidden, but the first frame
 * back would otherwise run straight into a live enemy.
 */
function holdPlayWhilePageHidden(shell: Shell): void {
  shell.onPageHide(() => useGameStore.getState().holdLiveStepWhilePageHidden())
}

/** The sound output's unlock reports, for the stage's "tap for sound" chip (ticket 478). */
function showWhetherSoundPlays(): void {
  onSoundUnlockChange((unlock) => useGameStore.getState().noteSoundUnlock(unlock))
}

function saveFolderInstallOf(shell: Shell): SaveFolderInstall {
  return {
    folder: saveFolderOf(shell),
    readWallClockMs: () => Date.now(),
    askToKeepSaves: () => void shell.askToKeepSaves(),
  }
}

/**
 * Saves on a phone (#470 P1-8, ticket 479): the browser is asked to keep them at the first tap as
 * well as at the first save, Export and Import go through the shell's files, and a page hidden
 * while docked writes the autosave once more.
 */
function keepSavesOnThisDevice(shell: Shell): void {
  shell.onFirstTap(() => void shell.askToKeepSaves())
  installSaveTransfer({
    handOverSaveFile: (fileName, json) => shell.handOverSaveFile(fileName, json),
    pickSaveFile: () => shell.pickSaveFile(),
  })
  shell.onPageHide(() => useGameStore.getState().writeCheckpointOnPageHide())
}

function saveFolderOf(shell: Shell): SaveFolder {
  return {
    list: () => shell.listSaveSlots(),
    read: (slot) => shell.readSaveSlot(slot),
    write: (slot, json, entryJson) => shell.writeSaveSlot(slot, json, entryJson),
    remove: (slot) => shell.deleteSaveSlot(slot),
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

/**
 * `?noflags` (ticket 548): a bad override can never lock anyone out, so the launch forgets the
 * browser's overrides and the tab's debug session marker before anything reads them.
 */
function forgetDevFlagsOnNoFlagsLaunch(shell: Shell): void {
  if (shell.launch.isNoFlagsAsked) forgetDevFlagOverrides(shell.devFlags)
}

/**
 * The overrides are read in a debug session only (the #548 ruling): a player's launch, a scenario
 * and every headless run install no storage, so nothing stored ever reaches them.
 */
function readDevFlagOverridesInDebugSession(shell: Shell): void {
  if (!isDevFlagSession(shell.launch, shell.devFlags)) return
  installDevFlagStorage(shell.devFlags)
  useGameStore.getState().loadDevFlagOverrides()
}

/**
 * The hidden gesture (ticket 549) enters a debug session on a player's launch: it marks the tab
 * and hands the store the overrides' storage. A scenario launch sets its own start and never
 * reads an override, so it gets no entry.
 */
function offerDebugSessionByGesture(shell: Shell): void {
  if (shell.launch.scenarioText !== null) return
  installDebugSessionEntry(() => {
    shell.devFlags.markDebugSession()
    return shell.devFlags
  })
}

/**
 * Quit and resume (#26), the resumed world's overrides applied over its own flags; else a fresh
 * session, which gets them at its first tick. A launch scenario sets its own start instead.
 */
async function resumeLastCheckpointOrStartFresh(shell: Shell): Promise<void> {
  const checkpoint = shell.launch.scenarioText === null ? await loadCheckpoint() : null
  if (isResumable(checkpoint)) useGameStore.getState().resumeCheckpoint(checkpoint)
  else startFreshSession(checkpoint)
}

function isResumable(checkpoint: CheckpointLoad): checkpoint is Checkpoint {
  return checkpoint !== null && 'state' in checkpoint
}

function startFreshSession(checkpoint: CheckpointLoad): void {
  reportRefusedCheckpoint(checkpoint)
  useGameStore.getState().startSessionDevFlags()
}

function reportRefusedCheckpoint(checkpoint: CheckpointLoad): void {
  if (checkpoint !== null && 'problems' in checkpoint)
    console.error(`checkpoint refused, starting fresh: ${checkpoint.problems.join('; ')}`)
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

/**
 * Snapshots (#123) are for debug runs only (`launch.debugEnabled`: dev, `?debug`, `--debug-api`);
 * a plain scenario run logs perf lines but keeps no snapshots. Before the checkpoint is installed,
 * so the first slot save already keeps its copy.
 */
function keepSnapshotsOnDebugRuns(shell: Shell, runId: string): void {
  if (!shell.launch.debugEnabled) return
  turnOnSnapshots(snapshotSourcesOf(shell, runId))
  listenForDomainEvents(snapshotPlanetChange)
  shell.onPageHide(snapshotSaveAtSessionEnd)
}

function snapshotSourcesOf(shell: Shell, runId: string): SnapshotSources {
  return {
    writeFile: (file, bytes) => shell.writeRunSnapshot(runId, file, bytes),
    writeHeapSnapshot: (file) => shell.writeHeapSnapshot(runId, file),
    captureScreenshot: requestCanvasScreenshot,
    readSaveFile: saveFileNow,
    exportZip: () => shell.exportRunSnapshots(),
  }
}

function applyLaunchScenario(shell: Shell): void {
  const text = shell.launch.scenarioText
  if (text === null) return
  const { scenario, problems } = parseScenario(text)
  if (problems.length > 0) throw new Error(`launch scenario refused: ${problems.join('; ')}`)
  useGameStore.getState().applyScenario(scenario as Scenario)
}

/**
 * The run has started (#16): the opening transmission and `hint_move` go up unless seen. Behind
 * the title menu they wait for the game it starts.
 */
function startHintsUnlessOnTitle(): void {
  if (useGameStore.getState().titleMenu !== null) return
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
    ...runFlagFieldsOf(readAuthorityState(), game.clientDevFlags.flags),
    players: 1,
    startTime: run.startedAt.toISOString(),
    endTime: null,
  })
  reportFailure(writeRunMetadata(shell, metadata))
}

function reportFailure(write: Promise<void>): void {
  void write.catch((error) => console.error('run file write failed', error))
}
