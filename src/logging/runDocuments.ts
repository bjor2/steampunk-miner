/**
 * Writes a run's two JSON documents through the shell's transport (logging never imports
 * src/shell). The summary is the `deriveSummary` fold over the events the run recorded (a live run
 * folds them as they arrive, `createSummarySink`), formatted once, so the file and a summary
 * derived later from `events.ndjson` are equal (#11 acceptance 4).
 */
import type { RunMetadata } from './runMetadata'
import { formatRunSummary, type RunSummary } from './runSummary'

export type RunDocumentName = 'metadata' | 'summary'

export interface RunDocumentTransport {
  writeRunDocument(runId: string, document: RunDocumentName, json: string): Promise<void>
}

export function writeRunSummary(
  transport: RunDocumentTransport,
  runId: string,
  summary: RunSummary,
): Promise<void> {
  return transport.writeRunDocument(runId, 'summary', formatRunSummary(summary))
}

export function writeRunMetadata(
  transport: RunDocumentTransport,
  metadata: RunMetadata,
): Promise<void> {
  return transport.writeRunDocument(metadata.runId, 'metadata', JSON.stringify(metadata, null, 2))
}
