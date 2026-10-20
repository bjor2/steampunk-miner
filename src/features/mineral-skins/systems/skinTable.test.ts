import { describe, expect, it } from 'vitest'
import { MATERIALS } from '../../materials'
import { loadSkinTable, MINERAL_SKINS, skinTableProblems, type SkinGuardContext } from './skinTable'

// The loader guards of ticket 591: a skin row names a species and one id of each layer list, a
// species wears one skin, and no two species of one pool share all four layers (#576).

const CONTEXT: SkinGuardContext = {
  poolBySpecies: new Map([
    ['ironstone-brassvein', 'legacy'],
    ['verdigris-copper', 'legacy'],
    ['far-copper', 'foothold-p3'],
  ]),
}

const LAYERS = {
  base: [{ id: 'granular' }, { id: 'glassy' }],
  vein: [{ id: 'brass-thread' }],
  palette: [{ id: 'umber' }],
  sheen: [{ id: 'dull' }, { id: 'waxy' }],
}

function skinRow(species: string, sheen = 'dull') {
  return { species, base: 'granular', vein: 'brass-thread', palette: 'umber', sheen }
}

function fileOf(skins: readonly object[], layers: object = LAYERS) {
  return { layers, skins }
}

describe('mineral skins table', () => {
  it('loads the shipped table with every layer list', () => {
    expect(Object.keys(MINERAL_SKINS.layers)).toEqual(['base', 'vein', 'palette', 'sheen'])
  })

  it('loads an empty table, so the batch tickets land rows one planet at a time', () => {
    const empty = { base: [], vein: [], palette: [], sheen: [] }
    expect(loadSkinTable(fileOf([], empty), CONTEXT).skins).toEqual([])
  })

  it('skins only species of the materials table', () => {
    const species = MATERIALS.materials[0].id
    const context = { poolBySpecies: new Map([[species, MATERIALS.materials[0].pool]]) }
    expect(skinTableProblems(fileOf([skinRow(species)]), context)).toEqual([])
    expect(skinTableProblems(fileOf([skinRow('no-such-rock')]), CONTEXT)).toEqual([
      'a skin names no-such-rock, which is no species of the materials table',
    ])
  })

  it('refuses a species wearing two skins', () => {
    const file = fileOf([skinRow('ironstone-brassvein'), skinRow('ironstone-brassvein', 'waxy')])
    expect(skinTableProblems(file, CONTEXT)).toEqual([
      'ironstone-brassvein wears two skins; a species has one',
    ])
  })

  it('refuses a layer id its layer list lacks', () => {
    const file = fileOf([{ ...skinRow('ironstone-brassvein'), vein: 'spiral' }])
    expect(skinTableProblems(file, CONTEXT)).toEqual([
      'ironstone-brassvein names the vein spiral, which layers.vein lacks',
    ])
  })

  it('refuses two species of one pool sharing all four layers', () => {
    const file = fileOf([skinRow('ironstone-brassvein'), skinRow('verdigris-copper')])
    expect(skinTableProblems(file, CONTEXT)).toEqual([
      'verdigris-copper shares base granular, vein brass-thread, palette umber, sheen dull with ironstone-brassvein in pool legacy',
    ])
  })

  it('lets two species of one pool share three layers when the fourth differs', () => {
    const file = fileOf([skinRow('ironstone-brassvein'), skinRow('verdigris-copper', 'waxy')])
    expect(skinTableProblems(file, CONTEXT)).toEqual([])
  })

  it('lets species of two pools share a combination, since no planet shows both', () => {
    const file = fileOf([skinRow('ironstone-brassvein'), skinRow('far-copper')])
    expect(skinTableProblems(file, CONTEXT)).toEqual([])
  })

  it('refuses ids that are not kebab-case, unknown fields and a layer listed twice', () => {
    const layers = { ...LAYERS, sheen: [{ id: 'dull' }, { id: 'dull' }, { id: 'Waxy', gloss: 1 }] }
    const file = fileOf(
      [{ ...skinRow('ironstone-brassvein'), base: 'Granular', tint: 'red' }],
      layers,
    )
    expect(skinTableProblems(file, CONTEXT)).toEqual([
      'layers.sheen[2].id must be kebab-case',
      'layers.sheen[2].gloss is not a field',
      'layers.sheen lists dull twice',
      'skins[0].base must be a kebab-case id',
      'skins[0].tint is not a field',
    ])
  })

  it('refuses a file without its lists, and the loader throws with every problem', () => {
    expect(skinTableProblems({ skins: [] }, CONTEXT)).toEqual([
      'skins and layers.base, layers.vein, layers.palette, layers.sheen must be lists',
    ])
    expect(() => loadSkinTable({}, CONTEXT)).toThrow(/mineralSkins\.json is refused/)
  })
})
