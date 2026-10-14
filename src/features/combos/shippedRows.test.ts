import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contentOf } from '../../systems/registries/content'
import { itemDescriptionEntryOf } from '../../systems/registries/itemDescriptionEntries'
import { entriesOf } from '../../systems/registries/seal'
import { ITEM_HOOK_REGISTRY } from '../../systems/registries/itemHooks'
import { COMBO_HOLDS, COMBO_ITEMS, COMBO_TEMPLATES, authoredComboNodesOf } from '.'

// Ticket 206 as 206b (GD lock on #206): the combos whose parents' lanes answer through the kernel
// item hooks ship, with their store item, authored node, template, card and hooks; the foam combos
// (#202), the aether reel (tow, decision 10) and the ceiling anchor (#288) stay vision rows. The
// folder imports no lane slice (the combos acceptance).

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
  new Set(
    [
      ...contentOf('vehicle-item'),
      ...contentOf('tech-node'),
      ...contentOf('tech-combo-template'),
    ].map((entry) => entry.id),
  )

const isHeld = (itemId: string) => Object.hasOwn(COMBO_HOLDS, itemId)
const shipped = COMBO_ITEMS.filter((item) => !isHeld(item.itemId))
const held = COMBO_ITEMS.filter((item) => isHeld(item.itemId))

describe('combos shipped and held', () => {
  it('ships the four authored combos the hooks reach and the lodestone drain and lens corer', () => {
    expect(shipped.map((item) => item.itemId)).toEqual([
      'combo.assay_drain',
      'combo.magnetic_survey',
      'combo.alarm_shield',
      'combo.cored_drain',
      'combo.lodestone_drain',
      'combo.lens_corer',
    ])
  })

  it("registers each shipped combo's store item, authored node and template", () => {
    const ids = registeredIds()
    const expected = [
      ...shipped.map((item) => item.itemId),
      ...authoredComboNodesOf(shipped).map((node) => node.id),
      ...COMBO_TEMPLATES.filter((template) => !isHeld(template.unlocks)).map((t) => t.id),
    ]
    expect(expected.filter((id) => !ids.has(id))).toEqual([])
  })

  it('registers no held combo: no store item, node, template or card', () => {
    const ids = registeredIds()
    const heldIds = [
      ...held.map((item) => item.itemId),
      ...authoredComboNodesOf(held).map((node) => node.id),
      ...COMBO_TEMPLATES.filter((template) => isHeld(template.unlocks)).map((t) => t.id),
    ]
    expect(heldIds.filter((id) => ids.has(id))).toEqual([])
    held.forEach((item) =>
      expect(itemDescriptionEntryOf({ kind: 'vehicle-item', id: item.itemId })).toBeNull(),
    )
  })

  it('holds exactly the foam combos, the aether reel and the ceiling anchor, each with a reason', () => {
    expect(Object.keys(COMBO_HOLDS).sort()).toEqual([
      'combo.aether_reel',
      'combo.ceiling_anchor',
      'combo.foam_cutters',
      'combo.foam_grapple',
    ])
  })

  it('registers hooks for shipped combos only, every id under the slice', () => {
    const hooks = entriesOf(ITEM_HOOK_REGISTRY).filter((hook) => hook.id.startsWith('combos.'))
    expect(hooks.length).toBeGreaterThan(0)
    hooks.forEach((hook) =>
      expect(held.some((item) => hook.id.includes(item.itemId.slice(6)))).toBe(false),
    )
  })

  it('imports no lane slice: parents are node and item ids', () => {
    expect(sourcesOf(SLICE_DIR).flatMap(importedLaneSlicesOf)).toEqual([])
  })
})
