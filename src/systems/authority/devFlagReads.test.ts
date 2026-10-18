import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Ticket 547: the rules read the session's flags (`flagsOf(state)`), never the module global, so a
// flip made by `debug.setFlags` is the flip every rule sees. Only the flags' own module, the one
// overlay that reads the shipped defaults, the panel's metadata rows and spec support (specs and
// their fixtures) may name `AUTHORITY_DEV_FLAGS`.

const SRC = new URL('../../', import.meta.url)
const MAY_READ_DEFAULTS = [
  'constants/devFlags.ts',
  'constants/devFlagRows.ts',
  'systems/authority/devFlagState.ts',
]

function isSpecSupport(path: string): boolean {
  return /\.test\.tsx?$/.test(path) || /Fixtures\.ts$/.test(path)
}

function filesReadingTheGlobal(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => /\.tsx?$/.test(path) && !isSpecSupport(path))
    .filter((path) => readFileSync(new URL(path, SRC), 'utf8').includes('AUTHORITY_DEV_FLAGS'))
    .sort()
}

describe('authority dev flag reads', () => {
  it('leave the module global to the shipped defaults: no rule reads it', () => {
    expect(filesReadingTheGlobal()).toEqual([...MAY_READ_DEFAULTS].sort())
  })
})
