/**
 * The only module that writes a debug run's snapshots to disk (#123, logging strategy section 1):
 *   <logsRoot>/<runId>/snapshots/save-<tick>.json | shots/<tick>-<trigger>.png | heap/<tick>.heapsnapshot
 * The renderer names the file; the name, the run id and the size are checked here, as everything
 * arriving from the renderer is untrusted. A heap snapshot is taken of the page that asked, by
 * the main process, because a page has no API that writes one.
 */
import type { WebContents } from 'electron'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { prepareRunFolder } from './runLogFiles.cjs'

// Same rule as isValidSnapshotFile in src/logging/runLayout.ts (main cannot import the ESM renderer code).
const SNAPSHOT_FILE_PATTERN =
  /^(snapshots\/save-\d{1,15}\.json|heap\/\d{1,15}\.heapsnapshot|shots\/\d{1,15}-[a-z_]{1,32}\.png)$/
const HEAP_SNAPSHOT_PATTERN = /^heap\/\d{1,15}\.heapsnapshot$/
// A 4K screenshot as PNG stays well under this; a save is tens of KB.
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024

export async function writeRunSnapshot(
  logsRoot: string,
  runId: unknown,
  file: unknown,
  bytes: unknown,
): Promise<void> {
  const path = await prepareSnapshotPath(logsRoot, runId, acceptSnapshotFile(file))
  await writeFile(path, acceptBytes(bytes))
}

/** The heap snapshot's size in bytes, once it is on disk. */
export async function writeHeapSnapshot(
  logsRoot: string,
  runId: unknown,
  file: unknown,
  page: WebContents,
): Promise<number> {
  const path = await prepareSnapshotPath(logsRoot, runId, acceptHeapSnapshotFile(file))
  await page.takeHeapSnapshot(path)
  return (await stat(path)).size
}

async function prepareSnapshotPath(
  logsRoot: string,
  runId: unknown,
  file: string,
): Promise<string> {
  const path = join(await prepareRunFolder(logsRoot, runId), file)
  await mkdir(dirname(path), { recursive: true })
  return path
}

function acceptSnapshotFile(file: unknown): string {
  if (typeof file !== 'string' || !SNAPSHOT_FILE_PATTERN.test(file)) {
    throw new Error('invalid snapshot file name')
  }
  return file
}

function acceptHeapSnapshotFile(file: unknown): string {
  if (typeof file !== 'string' || !HEAP_SNAPSHOT_PATTERN.test(file)) {
    throw new Error('invalid heap snapshot file name')
  }
  return file
}

function acceptBytes(bytes: unknown): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error('invalid or oversized snapshot')
  }
  return bytes
}
