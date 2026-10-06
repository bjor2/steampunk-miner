/**
 * The session analysis's disk side (#125): every folder under a root that holds an
 * `events.ndjson`, with its `metadata.json` when it has one, the way the run log lays a run out
 * (`logs/<runId>/`, design doc section 23) and CI artifacts unpack (`session-<workflow>-<sha>-<id>/`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SessionFiles } from '../../src/logging/sessionAnalysis/sessionTable'

const EVENTS_FILE = 'events.ndjson'

export function readSessionFolders(root: string): SessionFiles[] {
  if (!existsSync(root)) return []
  return eventFilesUnder(root).map((file) => sessionFilesAt(join(root, dirname(file))))
}

/** Paths relative to `root`, sorted so a pass reads the same order on every machine. */
function eventFilesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(
      (path) =>
        path === EVENTS_FILE ||
        path.endsWith(`/${EVENTS_FILE}`) ||
        path.endsWith(`\\${EVENTS_FILE}`),
    )
    .sort()
}

function sessionFilesAt(folder: string): SessionFiles {
  const metadata = join(folder, 'metadata.json')
  return {
    folder,
    eventsText: readFileSync(join(folder, EVENTS_FILE), 'utf8'),
    metadataText: existsSync(metadata) ? readFileSync(metadata, 'utf8') : null,
  }
}
