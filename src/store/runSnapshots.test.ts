import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import type { SceneMemory } from '../logging/memorySample'
import { perfSampleOf, type FrameCost } from '../logging/perfSample'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { toCanonical, ZERO_MONEY } from '../systems/money'
import { readSaveSlot } from '../systems/save/saveSlot'
import { checkpointWrites, installSaveSlots, saveFileNow, type SaveSlots } from './checkpoint'
import { listenForDomainEvents } from './domainEventBroadcast'
import { resetGameStore, useGameStore } from './gameStore'
import { recordMemorySample, recordPerfSample, turnOffPerfLog, turnOnPerfLog } from './perfLog'
import {
  exportSnapshotZip,
  snapshotPlanetChange,
  snapshotSaveAtSessionEnd,
  snapshotSaveOnTimer,
  snapshotWrites,
  turnOffSnapshots,
  turnOnSnapshots,
  type SnapshotSources,
} from './runSnapshots'

const MIB = 1024 * 1024
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const HEAP_SNAPSHOT_BYTES = 182_340_112

const SCENE: SceneMemory = {
  geometries: 40,
  textures: 21,
  programs: 9,
  rigidBodies: 1,
  colliders: 7,
  wasmBytes: 1_376_256,
  chunksCached: 64,
  chunksMeshed: 12,
}

/** One second of frames whose p95 is `frameMsP95`. */
function secondAt(frameMsP95: number): FrameCost {
  return {
    frameMsP50: 9,
    frameMsP95,
    frameMsP99: frameMsP95,
    longFrames: 0,
    renderScale: 1,
    drawCalls: 41,
    triangles: 2608,
    groundBlocks: 37,
    drawnChunks: 6,
    groundColliders: 8,
  }
}

type Shell = 'electron' | 'browser'

/** The shell's snapshot files kept in memory: Electron takes heap snapshots, a browser cannot. */
function memorySnapshotFiles(shell: Shell) {
  const files = new Map<string, Uint8Array>()
  const sources: SnapshotSources = {
    writeFile: async (file, bytes) => void files.set(file, bytes),
    writeHeapSnapshot: async (file) => {
      if (shell === 'browser') return null
      files.set(file, new Uint8Array(0))
      return HEAP_SNAPSHOT_BYTES
    },
    captureScreenshot: async () => (isCanvasDrawing ? PNG : null),
    readSaveFile: saveFileNow,
    exportZip: async () =>
      shell === 'browser' ? { file: 'snapshots.zip', bytes: 22, entries: [...files.keys()] } : null,
  }
  return { files, sources }
}

const noSaveSlots: SaveSlots = {
  write: async () => undefined,
  read: async () => null,
  setAside: async () => undefined,
}

let sink: MemorySink
let heapUsedMiB: number
let isCanvasDrawing: boolean
let stopListening: () => void

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  installSaveSlots(noSaveSlots)
  heapUsedMiB = 60
  isCanvasDrawing = true
  turnOnPerfLog({
    readPageMemory: () => ({
      jsHeap: { usedBytes: heapUsedMiB * MIB, totalBytes: 300 * MIB, limitBytes: 4096 * MIB },
      domNodes: 120,
      listeners: 31,
    }),
    readRunProgress: () => ({
      maxDepthTiles: 0,
      tilesDestroyed: 0,
      mineralsCollected: 0,
      moneyTotal: toCanonical(ZERO_MONEY),
    }),
  })
  // As the composition root wires it.
  stopListening = listenForDomainEvents(snapshotPlanetChange)
})

afterEach(() => {
  stopListening()
  turnOffSnapshots()
  turnOffPerfLog()
  installSaveSlots(null)
  uninstallRunLog()
})

const game = () => useGameStore.getState()
const linesNamed = (event: string) => sink.events.filter((line) => line.event === event)
const snapshotLines = () => linesNamed('snapshot_written').map((line) => line.data)

function sampleHeapAt(...readingsMiB: number[]): void {
  readingsMiB.forEach((usedMiB, index) => {
    heapUsedMiB = usedMiB
    recordMemorySample(() => SCENE, 10 * (index + 1))
  })
}

function sampleFramesAt(...frameMsP95PerSecond: number[]): void {
  frameMsP95PerSecond.forEach((p95) => recordPerfSample(perfSampleOf(secondAt(p95), 1)))
}

/** Every trigger a short run can meet: a dock, a planet change, a heap climb, a breach, the timer, a quit. */
async function playEveryTrigger(): Promise<void> {
  game().dock('sell')
  game().setPlanet(2)
  sampleHeapAt(60, 115, 120)
  sampleFramesAt(12, 40, 12)
  snapshotSaveOnTimer()
  snapshotSaveAtSessionEnd()
  await checkpointWrites()
  await snapshotWrites()
}

describe('debug run snapshots (#123)', () => {
  it('keeps no snapshot and logs no snapshot line in a run that is not a debug run', async () => {
    await playEveryTrigger()
    expect(linesNamed('snapshot_written')).toEqual([])
    expect(linesNamed('checkpoint_saved').map((line) => line.data)).not.toContainEqual(
      expect.objectContaining({ file: expect.anything() }),
    )
  })

  it('writes a heap snapshot at each heap step in Electron and logs its file and size', async () => {
    const disk = memorySnapshotFiles('electron')
    turnOnSnapshots(disk.sources)
    sampleHeapAt(60, 100, 111, 165)
    await snapshotWrites()
    const heapLines = snapshotLines()
    expect(heapLines).toEqual([
      {
        kind: 'heap',
        trigger: 'heap_step',
        file: 'heap/0.heapsnapshot',
        bytes: HEAP_SNAPSHOT_BYTES,
      },
      {
        kind: 'heap',
        trigger: 'heap_step',
        file: 'heap/0.heapsnapshot',
        bytes: HEAP_SNAPSHOT_BYTES,
      },
    ])
    expect(disk.files.has('heap/0.heapsnapshot')).toBe(true)
  })

  it('logs a browser heap step with no file, since a page cannot write a heap snapshot', async () => {
    turnOnSnapshots(memorySnapshotFiles('browser').sources)
    sampleHeapAt(60, 111)
    await snapshotWrites()
    expect(snapshotLines()).toEqual([{ kind: 'heap', trigger: 'heap_step' }])
  })

  it('keeps a copy of each slot save and names it in checkpoint_saved', async () => {
    const disk = memorySnapshotFiles('browser')
    turnOnSnapshots(disk.sources)
    game().dock('sell')
    await checkpointWrites()
    const [saved] = linesNamed('checkpoint_saved')
    expect(saved.data).toMatchObject({
      slot: 'slot-1',
      epoch: 1,
      file: `snapshots/save-${saved.tick}.json`,
    })
    const copy = JSON.parse(
      new TextDecoder().decode(disk.files.get(`snapshots/save-${saved.tick}.json`)),
    )
    expect(copy).toMatchObject({ saveEpoch: 1, digest: saved.data.digest })
    expect(snapshotLines()).toEqual([])
  })

  it('logs the timed and session-end saves as snapshot_written, never as checkpoint_saved', async () => {
    const disk = memorySnapshotFiles('electron')
    turnOnSnapshots(disk.sources)
    snapshotSaveOnTimer()
    snapshotSaveAtSessionEnd()
    await snapshotWrites()
    const file = 'snapshots/save-0.json'
    expect(snapshotLines()).toEqual([
      { kind: 'save', trigger: 'timer', file, bytes: disk.files.get(file)?.length },
      { kind: 'save', trigger: 'session_end', file, bytes: disk.files.get(file)?.length },
    ])
    expect(linesNamed('checkpoint_saved')).toEqual([])
    const save = JSON.parse(new TextDecoder().decode(disk.files.get(file)))
    expect(readSaveSlot(save).problems).toEqual([])
  })

  it('takes one screenshot when the run moves to another planet', async () => {
    const disk = memorySnapshotFiles('browser')
    turnOnSnapshots(disk.sources)
    game().setPlanet(3)
    await snapshotWrites()
    const [shot] = linesNamed('snapshot_written')
    expect(shot.data).toEqual({
      kind: 'screenshot',
      trigger: 'planet_change',
      file: `shots/${shot.tick}-planet_change.png`,
      bytes: PNG.length,
    })
    expect(disk.files.get(`shots/${shot.tick}-planet_change.png`)).toEqual(PNG)
  })

  it('takes one screenshot per frame budget breach, again only after a second back in budget', async () => {
    turnOnSnapshots(memorySnapshotFiles('browser').sources)
    sampleFramesAt(12, 20, 33, 18, 16, 25)
    await snapshotWrites()
    expect(snapshotLines().map((line) => line.trigger)).toEqual(['budget_breach', 'budget_breach'])
  })

  it('logs no screenshot while no canvas is drawing', async () => {
    turnOnSnapshots(memorySnapshotFiles('browser').sources)
    isCanvasDrawing = false
    game().setPlanet(3)
    sampleFramesAt(40)
    await snapshotWrites()
    expect(snapshotLines()).toEqual([])
  })

  it('writes only registered lines across every trigger', async () => {
    turnOnSnapshots(memorySnapshotFiles('electron').sources)
    await playEveryTrigger()
    expect(snapshotLines().map((line) => `${line.kind}:${line.trigger}`)).toEqual([
      'screenshot:planet_change',
      'heap:heap_step',
      'screenshot:budget_breach',
      'save:timer',
      'save:session_end',
    ])
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('exports the kept snapshots as a zip in a browser and refuses where they are files already', async () => {
    expect(await exportSnapshotZip()).toEqual({
      ok: false,
      problems: ['this run keeps no snapshots'],
    })
    turnOnSnapshots(memorySnapshotFiles('electron').sources)
    expect(await exportSnapshotZip()).toMatchObject({ ok: false })
    turnOnSnapshots(memorySnapshotFiles('browser').sources)
    snapshotSaveOnTimer()
    expect(await exportSnapshotZip()).toEqual({
      ok: true,
      file: 'snapshots.zip',
      bytes: 22,
      entries: ['snapshots/save-0.json'],
    })
  })
})
