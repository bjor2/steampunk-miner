/**
 * Recorded `commands.ndjson` files of the real vehicle loop drilling an 80 m down leg (the TD's
 * read-only probe on #514, origin/main 66a02b09 with the drill report interval patched in), written
 * under log schema 6, before pose runs: the stored-1 rig at a report every tick (3097 reports), the
 * stored-200 rig at a report every tick, and the stored-1 rig at today's 12. Gzipped, as the plain
 * text is 380 KB. Used by the specs only (ticket 522).
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import type { LoggedCommand } from '../../commandLog'

export const RECORDED_POSE_TRACKS = [
  'stored-1-interval-1-down',
  'stored-200-interval-1-down',
  'stored-1-interval-12-down',
] as const

export type RecordedPoseTrack = (typeof RECORDED_POSE_TRACKS)[number]

/** The track's file text, exactly as the old writer wrote it. */
export function recordedTrackText(track: RecordedPoseTrack): string {
  const file = new URL(`./${track}.ndjson.gz`, import.meta.url)
  return gunzipSync(readFileSync(file)).toString('utf8')
}

/** The track's lines, parsed. */
export function recordedTrackLines(track: RecordedPoseTrack): LoggedCommand[] {
  return recordedTrackText(track)
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as LoggedCommand)
}
