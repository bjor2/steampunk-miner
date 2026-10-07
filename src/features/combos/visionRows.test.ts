import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contentOf } from '../../systems/registries/content'
import { COMBO_HOLDS, COMBO_ITEMS, COMBO_TEMPLATES, authoredComboNodesOf } from '.'

// Ticket 206: every combo waits for a hook in its parents' slices, so the slice registers nothing
// (GD lock on #205 Q2, Q3) and this folder imports no lane slice (the combos acceptance).

const SLICE_DIR = new URL('./', import.meta.url)
const LANE_SLICES = ['extraction', 'terrain-tools', 'sensing', 'mobility', 'drill-gear']

function sourcesOf(dir: URL): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return sourcesOf(new URL(`${entry.name}/`, dir))
    const isSource = /\.tsx?$/.test(entry.name)
    return isSource ? [readFileSync(new URL(entry.name, dir), 'utf8')] : []
  })
}

/** An import from a lane slice's folder, at any depth. */
function importedLaneSlicesOf(source: string): string[] {
  return LANE_SLICES.filter((lane) => new RegExp(`from '(\\.\\./)+${lane}[/']`).test(source))
}

const registeredIds = () =>
  [
    ...contentOf('vehicle-item'),
    ...contentOf('tech-node'),
    ...contentOf('tech-combo-template'),
  ].map((entry) => entry.id)

describe('combos vision rows', () => {
  it('registers no combo item, node or template while every combo is held', () => {
    const ids = [
      ...COMBO_ITEMS.map((item) => item.itemId),
      ...authoredComboNodesOf(COMBO_ITEMS).map((node) => node.id),
      ...COMBO_TEMPLATES.map((template) => template.id),
    ]
    expect(registeredIds().filter((id) => ids.includes(id))).toEqual([])
  })

  it('says why every combo and every template row is held', () => {
    const rows = COMBO_TEMPLATES.map((template) => template.unlocks)
    expect(Object.keys(COMBO_HOLDS).sort()).toEqual(rows.sort())
  })

  it('imports no lane slice: parents are node ids', () => {
    expect(sourcesOf(SLICE_DIR).flatMap(importedLaneSlicesOf)).toEqual([])
  })
})
