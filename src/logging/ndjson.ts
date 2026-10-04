/**
 * NDJSON: one JSON event per line, easy to append, stream and read after a crash
 * (design doc section 23). Non-finite numbers cannot be JSON; JSON.stringify writes them as
 * null, so rules must not rely on logging Infinity or NaN.
 */
import type { RunEvent } from './runEvent'

/** One run event or one authority command as a line. */
export function formatNdjsonLine(record: object): string {
  return `${JSON.stringify(record)}\n`
}

export function parseNdjson(text: string): RunEvent[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as RunEvent)
}
