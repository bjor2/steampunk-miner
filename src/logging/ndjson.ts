/**
 * NDJSON: one JSON event per line, easy to append, stream and read after a crash
 * (design doc section 23). Non-finite numbers cannot be JSON; JSON.stringify writes them as
 * null, so rules must not rely on logging Infinity or NaN.
 */
import type { RunEvent } from './runEvent'

export function formatNdjsonLine(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`
}

export function parseNdjson(text: string): RunEvent[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as RunEvent)
}
