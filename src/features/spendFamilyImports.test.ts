import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { registrationsOf } from '../systems/registries/seal'
import { SPEND_FAMILY_REGISTRY } from '../systems/registries/spendFamilies'

// The dependency proof of ticket 370 (GD ruling Q3 on #212): the tech-tree reads the spend guard's
// families only through the kernel registry, so it never imports a slice that registers one. Runs
// on the loaded slices, so a slice that adds a family joins the check with no edit here.
const FEATURES_DIR = resolve(__dirname)
const TECH_TREE_DIR = join(FEATURES_DIR, 'tech-tree')
const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*'(\.[^']*)'/g

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFilesUnder(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** The slice folder a relative import in `file` lands in, or null outside src/features. */
function importedSlicesOf(file: string): string[] {
  const specifiers = [...readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)].map((m) => m[1])
  return specifiers.flatMap((specifier) => {
    const target = relative(FEATURES_DIR, resolve(dirname(file), specifier))
    const sliceId = target.split(sep)[0]
    return target.startsWith('..') || sliceId === '' ? [] : [sliceId]
  })
}

function familySliceIds(): Set<string> {
  return new Set(registrationsOf(SPEND_FAMILY_REGISTRY).map((registration) => registration.sliceId))
}

describe('spend family imports', () => {
  it('has the tech-tree import no slice that registers a spend family', () => {
    const familySlices = familySliceIds()
    familySlices.delete('tech-tree')
    const offending = sourceFilesUnder(TECH_TREE_DIR).flatMap((file) =>
      importedSlicesOf(file)
        .filter((sliceId) => familySlices.has(sliceId))
        .map((sliceId) => `${relative(FEATURES_DIR, file)} imports ${sliceId}`),
    )
    expect(familySlices.size).toBeGreaterThan(0)
    expect(offending).toEqual([])
  })
})
