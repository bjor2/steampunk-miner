/**
 * The only module that writes run files to disk (design doc section 23):
 *   <logsRoot>/<runId>/events.ndjson | metadata.json | summary.json
 * Everything arriving from the renderer is treated as untrusted: ids and sizes are checked here.
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RunDocumentName } from './bridgeContract.cjs'

// Same rule as isValidRunId in src/logging/runLayout.ts (main cannot import the ESM renderer code).
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const DOCUMENT_NAMES: readonly string[] = ['metadata', 'summary']
const MAX_WRITE_BYTES = 8 * 1024 * 1024

export async function appendRunEvents(
  logsRoot: string,
  runId: unknown,
  ndjsonLines: unknown,
): Promise<void> {
  const folder = await prepareRunFolder(logsRoot, runId)
  await appendFile(join(folder, 'events.ndjson'), acceptText(ndjsonLines), 'utf8')
}

export async function writeRunDocument(
  logsRoot: string,
  runId: unknown,
  document: unknown,
  json: unknown,
): Promise<void> {
  const name = acceptDocumentName(document)
  const folder = await prepareRunFolder(logsRoot, runId)
  await writeFile(join(folder, `${name}.json`), acceptText(json), 'utf8')
}

async function prepareRunFolder(logsRoot: string, runId: unknown): Promise<string> {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw new Error('invalid run id')
  }
  const folder = join(logsRoot, runId)
  await mkdir(folder, { recursive: true })
  return folder
}

function acceptDocumentName(document: unknown): RunDocumentName {
  if (typeof document !== 'string' || !DOCUMENT_NAMES.includes(document)) {
    throw new Error('invalid run document name')
  }
  return document as RunDocumentName
}

function acceptText(text: unknown): string {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_WRITE_BYTES) {
    throw new Error('invalid or oversized text')
  }
  return text
}
