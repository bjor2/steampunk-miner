import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The render-only guard of ticket 913 (Systems' row and the TD's constraints on #666): the drawn
// width is read by the renderer alone, so cut width, casing a metre, the dynamite radius and the
// hold stay keyed to the collider and the Mark, and the economy trace replays byte for byte
// whatever width a rig is drawn at. Every module that reads the drawn width takes the rig's own
// width record, so a remote rig at another Mark never draws from the local `vehiclePresence`.
const SRC_DIR = resolve(__dirname, '../..')
const DRAWN_WIDTH_MODULE = join(SRC_DIR, 'systems/render/bodyWidthLook.ts')
const LOCAL_PRESENCE_MODULE = join(SRC_DIR, 'scene/vehiclePresence.ts')
const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*'(\.[^']*)'/g
/** An import of values, not a type alone: who calls the module, as against who names its shapes. */
const VALUE_IMPORT = /import\s+(?!type\s)[^']*?from\s*'(\.[^']*)'/g

/** The folders whose rules feed the authority, the economy, saves or the log. */
const RULE_DIRS = ['systems/authority', 'systems/economy', 'systems/vehicle', 'store', 'logging']

/** The local rig's composition root: it hands the local presence over as that rig's record. */
const LOCAL_RIG_ROOT = join(SRC_DIR, 'scene/Vehicle.tsx')

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFilesUnder(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : []
  })
}

/** The modules `file` imports by relative path with `pattern`, resolved without their extension. */
function importedModulesOf(file: string, pattern: RegExp): string[] {
  const specifiers = [...readFileSync(file, 'utf8').matchAll(pattern)].map((m) => m[1])
  return specifiers.map((specifier) => resolve(dirname(file), specifier).replace(/\.tsx?$/, ''))
}

function importsModule(file: string, module: string, pattern = IMPORT_SPECIFIER): boolean {
  return importedModulesOf(file, pattern).includes(module.replace(/\.tsx?$/, ''))
}

describe('drawn body width guard (ticket 913)', () => {
  it('keeps the drawn width out of every authority, economy, vehicle, store and log module', () => {
    const offending = RULE_DIRS.flatMap((dir) => sourceFilesUnder(join(SRC_DIR, dir)))
      .filter((file) => importsModule(file, DRAWN_WIDTH_MODULE))
      .map((file) => relative(SRC_DIR, file))
    expect(offending).toEqual([])
  })

  it('has every reader of the drawn width take its rig, never the local presence', () => {
    const readers = sourceFilesUnder(SRC_DIR).filter((file) =>
      importsModule(file, DRAWN_WIDTH_MODULE, VALUE_IMPORT),
    )
    const offending = readers
      .filter((file) => file !== LOCAL_RIG_ROOT && importsModule(file, LOCAL_PRESENCE_MODULE))
      .map((file) => relative(SRC_DIR, file))
    expect(readers.length).toBeGreaterThan(0)
    expect(offending).toEqual([])
  })
})
