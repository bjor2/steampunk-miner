/**
 * A debug run's snapshots in a plain browser (#123, logging strategy section 1: "IndexedDB with a
 * one-zip export"): no filesystem, so each file goes to IndexedDB under its run, and
 * `exportSnapshots()` downloads every kept run's files as one stored zip laid out like Electron's
 * `logs/`, `<runId>/<file>`. The newest few runs are kept, so dev reloads cannot fill the disk,
 * and a reload before an export still finds the run it replaced.
 */
import { zipStoredEntries, type ZipEntry } from './storedZip'
import type { SnapshotExport } from './shell'

const DATABASE_NAME = 'steampunk-miner-snapshots'
const DATABASE_VERSION = 1
const FILES = 'files'
/** This run and the two before it. Run ids sort by their start time (`createRunId`). */
const KEPT_RUNS = 3
const EXPORT_FILE_NAME = 'steampunk-miner-snapshots.zip'

interface StoredSnapshot {
  runId: string
  file: string
  bytes: Uint8Array
}

export interface BrowserSnapshots {
  write(runId: string, file: string, bytes: Uint8Array): Promise<void>
  exportAll(): Promise<SnapshotExport>
}

export function createBrowserSnapshots(): BrowserSnapshots {
  let opened: Promise<IDBDatabase> | null = null
  const prunedRuns = new Set<string>()
  const database = () => (opened ??= openSnapshotDatabase())
  return {
    write: async (runId, file, bytes) => {
      const db = await database()
      await pruneOnceBeforeFirstWrite(db, runId, prunedRuns)
      await putSnapshot(db, { runId, file, bytes })
    },
    exportAll: async () => downloadZipOf(await readAllSnapshots(await database())),
  }
}

function openSnapshotDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
  request.onupgradeneeded = () =>
    request.result.createObjectStore(FILES, { keyPath: ['runId', 'file'] })
  return resultOf(request)
}

async function pruneOnceBeforeFirstWrite(
  db: IDBDatabase,
  runId: string,
  prunedRuns: Set<string>,
): Promise<void> {
  if (prunedRuns.has(runId)) return
  prunedRuns.add(runId)
  await deleteRunsOlderThanKept(db, runId)
}

async function deleteRunsOlderThanKept(db: IDBDatabase, runId: string): Promise<void> {
  const runIds = await resultOf(db.transaction(FILES).objectStore(FILES).getAllKeys())
  const dropped = runsBeyondKept(runId, runIds as [string, string][])
  const store = db.transaction(FILES, 'readwrite').objectStore(FILES)
  await Promise.all(
    dropped.map((run) => resultOf(store.delete(IDBKeyRange.bound([run], [run, []])))),
  )
}

/** Older runs than the newest `KEPT_RUNS`, counting the run that is about to write. */
function runsBeyondKept(runId: string, keys: readonly [string, string][]): string[] {
  const runs = [...new Set([runId, ...keys.map(([run]) => run)])].sort().reverse()
  return runs.slice(KEPT_RUNS)
}

function putSnapshot(db: IDBDatabase, snapshot: StoredSnapshot): Promise<IDBValidKey> {
  return resultOf(db.transaction(FILES, 'readwrite').objectStore(FILES).put(snapshot))
}

async function readAllSnapshots(db: IDBDatabase): Promise<ZipEntry[]> {
  const snapshots = await resultOf(db.transaction(FILES).objectStore(FILES).getAll())
  return (snapshots as StoredSnapshot[]).map((snapshot) => ({
    path: `${snapshot.runId}/${snapshot.file}`,
    bytes: snapshot.bytes,
  }))
}

function downloadZipOf(entries: ZipEntry[]): SnapshotExport {
  const zip = zipStoredEntries(entries)
  downloadBytes(EXPORT_FILE_NAME, zip)
  return { file: EXPORT_FILE_NAME, bytes: zip.length, entries: entries.map((entry) => entry.path) }
}

function downloadBytes(fileName: string, bytes: Uint8Array<ArrayBuffer>): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // The download has its own copy once the click is handled.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function resultOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
