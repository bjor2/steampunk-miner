/**
 * The one writer of a debug run's snapshots (#123, logging strategy section 1, the locked answers
 * on #123): a copy of every slot save (named by `checkpoint_saved`), a save every 5 minutes of
 * frames and at session end, a heap snapshot each time the heap climbs another step, and a
 * screenshot on a planet change and at the start of a frame budget breach. Each is logged as one
 * `snapshot_written` once its file is written. The composition root turns it on for debug runs
 * only (`launch.debugEnabled`) and hands it the shell's files and the scene's canvas; any other run
 * keeps none and logs none. Snapshots are written one after another, in the order they fell due.
 */
import { FRAME_BUDGET_MS, HEAP_SNAPSHOT_STEP_KB } from '../constants/scene'
import type { RunEventData } from '../logging/eventNames'
import type { RunEventStamp } from '../logging/runEvent'
import {
  heapSnapshotFile,
  saveSnapshotFile,
  screenshotFile,
  type ScreenshotTrigger,
} from '../logging/runLayout'
import { getRunLog } from '../logging/runLog'
import type { DomainEvent } from '../systems/authority/domainEvent'
import type { SnapshotExport } from '../shell/shell'
import type { SaveSlotFile } from '../systems/save/saveSlot'
import {
  createBudgetBreachWatch,
  takeBudgetBreachStart,
  type BudgetBreachWatch,
} from '../systems/snapshots/budgetBreach'
import {
  createHeapWatch,
  takeHeapStepReached,
  type HeapWatch,
} from '../systems/snapshots/heapThreshold'
import { hasPlanetChanged } from '../systems/snapshots/planetChange'
import { readAuthorityState } from './authorityLink'
import { runEventPlaceOf, useGameStore } from './gameStore'

/** Where a debug run's snapshots go and what they are taken of. */
export interface SnapshotSources {
  /** Writes `file`, a path in the run folder: `logs/<runId>/` in Electron, IndexedDB in a browser. */
  writeFile(file: string, bytes: Uint8Array): Promise<void>
  /** Takes the page's heap snapshot into `file`: its size, or null where the page cannot (a browser). */
  writeHeapSnapshot(file: string): Promise<number | null>
  /** The game canvas as a PNG once its next frame is drawn; null while nothing is drawing. */
  captureScreenshot(): Promise<Uint8Array | null>
  /** The session as a save file now, under the last slot save's epoch (`saveFileNow`). */
  readSaveFile(): SaveSlotFile
  /** Zips the kept snapshots and hands the zip to the player; null where they are files already. */
  exportZip(): Promise<SnapshotExport | null>
}

type SnapshotLine = RunEventData<'snapshot_written'>
type SaveTrigger = 'timer' | 'session_end'

interface SnapshotKeeping {
  sources: SnapshotSources
  heap: HeapWatch
  breach: BudgetBreachWatch
}

let keeping: SnapshotKeeping | null = null
let writes: Promise<void> = Promise.resolve()

export function turnOnSnapshots(sources: SnapshotSources): void {
  keeping = {
    sources,
    heap: createHeapWatch(HEAP_SNAPSHOT_STEP_KB),
    breach: createBudgetBreachWatch(FRAME_BUDGET_MS),
  }
  writes = Promise.resolve()
}

/** For tests: back to a played run's default, which keeps no snapshots. */
export function turnOffSnapshots(): void {
  keeping = null
}

/** Settles when every snapshot queued so far is written and logged, or has failed and been reported. */
export function snapshotWrites(): Promise<void> {
  return writes
}

/** After each `memory_sample`: a heap snapshot when the heap has climbed another step. */
export function snapshotHeapStep(usedKB: number): void {
  if (keeping === null) return
  if (takeHeapStepReached(keeping.heap, usedKB) === 0) return
  const stamp = stampNow(readAuthorityState().tick)
  const sources = keeping.sources
  queueSnapshot(() => writeHeapSnapshot(sources, stamp))
}

/** After each `perf_sample`: a screenshot on the first second of a frame budget breach (#38). */
export function snapshotBudgetBreach(frameMsP95: number): void {
  if (keeping === null) return
  if (!takeBudgetBreachStart(keeping.breach, frameMsP95)) return
  queueScreenshot(keeping.sources, 'budget_breach')
}

/** A `listenForDomainEvents` listener: a screenshot of the planet the run moved to. */
export function snapshotPlanetChange(events: readonly DomainEvent[]): void {
  if (keeping === null || !hasPlanetChanged(events)) return
  queueScreenshot(keeping.sources, 'planet_change')
}

/** Every `SAVE_SNAPSHOT_SECONDS` of frames. */
export function snapshotSaveOnTimer(): void {
  queueSaveSnapshot('timer')
}

/** When the page hides or closes: the last state the session reached. */
export function snapshotSaveAtSessionEnd(): void {
  queueSaveSnapshot('session_end')
}

/**
 * A slot save's copy, written before `checkpoint_saved` is logged so the line can name it. Null
 * when the run keeps no snapshots or the copy failed: the slot save itself stands either way.
 */
export async function keepSlotSaveSnapshot(tick: number, json: string): Promise<string | null> {
  if (keeping === null) return null
  const file = saveSnapshotFile(tick)
  try {
    await keeping.sources.writeFile(file, utf8BytesOf(json))
    return file
  } catch (error) {
    reportFailedSnapshot(error)
    return null
  }
}

/** The debug API's `exportSnapshots()` (#123 locked answer 3). */
export async function exportSnapshotZip(): Promise<
  ({ ok: true } & SnapshotExport) | { ok: false; problems: string[] }
> {
  if (keeping === null) return { ok: false, problems: ['this run keeps no snapshots'] }
  await writes
  const exported = await keeping.sources.exportZip()
  if (exported === null)
    return { ok: false, problems: ['Electron writes snapshots into the run folder under logs/'] }
  return { ok: true, ...exported }
}

function queueSaveSnapshot(trigger: SaveTrigger): void {
  if (keeping === null) return
  const save = keeping.sources.readSaveFile()
  const stamp = stampNow(save.tick)
  const sources = keeping.sources
  queueSnapshot(() => writeSaveSnapshot(sources, stamp, { save, trigger }))
}

function queueScreenshot(sources: SnapshotSources, trigger: ScreenshotTrigger): void {
  const stamp = stampNow(readAuthorityState().tick)
  queueSnapshot(() => writeScreenshot(sources, stamp, trigger))
}

/** Stamped when due, written in turn: a slow heap snapshot holds back the ones after it. */
function queueSnapshot(write: () => Promise<void>): void {
  writes = writes.then(write).catch(reportFailedSnapshot)
}

async function writeHeapSnapshot(sources: SnapshotSources, stamp: RunEventStamp): Promise<void> {
  const file = heapSnapshotFile(stamp.tick)
  const bytes = await sources.writeHeapSnapshot(file)
  recordSnapshot(stamp, { kind: 'heap', trigger: 'heap_step', ...writtenFileOf(file, bytes) })
}

async function writeScreenshot(
  sources: SnapshotSources,
  stamp: RunEventStamp,
  trigger: ScreenshotTrigger,
): Promise<void> {
  const png = await sources.captureScreenshot()
  if (png === null) return
  const file = screenshotFile(stamp.tick, trigger)
  await sources.writeFile(file, png)
  recordSnapshot(stamp, { kind: 'screenshot', trigger, file, bytes: png.length })
}

async function writeSaveSnapshot(
  sources: SnapshotSources,
  stamp: RunEventStamp,
  snapshot: { save: SaveSlotFile; trigger: SaveTrigger },
): Promise<void> {
  const file = saveSnapshotFile(snapshot.save.tick)
  const bytes = utf8BytesOf(JSON.stringify(snapshot.save))
  await sources.writeFile(file, bytes)
  recordSnapshot(stamp, { kind: 'save', trigger: snapshot.trigger, file, bytes: bytes.length })
}

/** A browser heap step writes no file, so its line names none (#123 locked answer 1). */
function writtenFileOf(file: string, bytes: number | null): Pick<SnapshotLine, 'file' | 'bytes'> {
  return bytes === null ? {} : { file, bytes }
}

function recordSnapshot(stamp: RunEventStamp, line: SnapshotLine): void {
  getRunLog().record(stamp, 'snapshot_written', line)
}

function stampNow(tick: number): RunEventStamp {
  return { ...runEventPlaceOf(useGameStore.getState()), tick }
}

function utf8BytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function reportFailedSnapshot(error: unknown): void {
  console.error('snapshot write failed', error)
}
