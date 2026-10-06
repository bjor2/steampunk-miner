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

/**
 * The newest whole lines of `text` that fit in `maxChars`: a bounded copy of a log that keeps
 * growing (#117). A line that would not fit whole is dropped, never cut.
 */
export function keepNewestLines(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const lastDroppedEnd = text.indexOf('\n', text.length - maxChars - 1)
  return lastDroppedEnd === -1 ? '' : text.slice(lastDroppedEnd + 1)
}

export function parseNdjson(text: string): RunEvent[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as RunEvent)
}
