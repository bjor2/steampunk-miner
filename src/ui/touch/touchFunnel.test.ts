import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The touch adapter's one funnel (#474, the TD's section 1 on #470): the touch controls only press
// and release actions through the touch runtime, so nothing under src/ui/touch submits a command
// or applies one; the gates and carve rules stay authority-side.
const TOUCH_DIR = resolve(__dirname)
const SIM_ENTRY = /submit|applyCommand/

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFilesUnder(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

describe('touch funnel', () => {
  it('has no touch control submit or apply a command itself', () => {
    const files = sourceFilesUnder(TOUCH_DIR)
    const offending = files
      .filter((file) => SIM_ENTRY.test(readFileSync(file, 'utf8')))
      .map((file) => relative(TOUCH_DIR, file))
    expect(files.length).toBeGreaterThan(0)
    expect(offending).toEqual([])
  })
})
