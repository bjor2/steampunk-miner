import { describe, expect, it } from 'vitest'
import { rgbOfHex } from '../../../systems/render/colour'
import { MATERIALS } from '../../materials'
import type { SignatureMaterial } from './signatureMaterial'
import { loadSkinTable, MINERAL_SKINS, skinTableProblems, type SkinGuardContext } from './skinTable'

// The loader guards of ticket 591: a skin row names a species and one id of each layer list, a
// species wears one skin, and no two species of one pool share all four layers (#576). A palette
// is a ramp, darkest first, whose body is its species' hue slot colour (ticket 592). A planet's
// signature material wears its own row, apart from its pool's species, its palette's body inside
// its family's look bands (ticket 603).

const GREY = '#808080'

const CONTEXT: SkinGuardContext = {
  poolBySpecies: new Map([
    ['ironstone-brassvein', 'legacy'],
    ['verdigris-copper', 'legacy'],
    ['far-copper', 'foothold-p3'],
  ]),
  hueColourBySpecies: new Map(
    ['ironstone-brassvein', 'verdigris-copper', 'far-copper'].map((id) => [id, rgbOfHex(GREY)]),
  ),
  signatureByPlanet: new Map(),
}

const UMBER = { id: 'umber', ramp: ['#404040', GREY, '#c0c0c0'] }

const LAYERS = {
  base: [{ id: 'granular' }, { id: 'glassy' }],
  vein: [{ id: 'brass-thread' }],
  palette: [UMBER],
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
    const context = {
      poolBySpecies: new Map([[species, MATERIALS.materials[0].pool]]),
      hueColourBySpecies: new Map([[species, rgbOfHex(GREY)]]),
      signatureByPlanet: new Map(),
    }
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

  it('refuses a palette that is not three colours running darkest first', () => {
    const palettes = [
      { id: 'umber', ramp: ['#404040', GREY] },
      { id: 'tin', ramp: ['#c0c0c0', GREY, '#404040'] },
      { id: 'ash', ramp: ['#404040', GREY, '#c0c0c0'], gloss: 1 },
      { id: 'rust' },
    ]
    expect(skinTableProblems(fileOf([], { ...LAYERS, palette: palettes }), CONTEXT)).toEqual([
      'layers.palette[0].ramp must be three #rrggbb colours',
      'layers.palette[1].ramp must run darkest first, shadow, body, light',
      'layers.palette[2].gloss is not a field',
      'layers.palette[3].ramp must be three #rrggbb colours',
    ])
  })

  it('refuses a palette whose body is not the hue slot colour of the species wearing it', () => {
    const umber = { id: 'umber', ramp: ['#404040', '#828080', '#c0c0c0'] }
    const file = fileOf([skinRow('ironstone-brassvein')], { ...LAYERS, palette: [umber] })
    expect(skinTableProblems(file, CONTEXT)).toEqual([
      'ironstone-brassvein wears the palette umber, whose body is not its hue slot colour',
    ])
  })

  it('refuses a file without its lists, and the loader throws with every problem', () => {
    expect(skinTableProblems({ skins: [] }, CONTEXT)).toEqual([
      'skins and layers.base, layers.vein, layers.palette, layers.sheen must be lists',
    ])
    expect(() => loadSkinTable({}, CONTEXT)).toThrow(/mineralSkins\.json is refused/)
  })
})

/** Planet 9 paints a relic signature on the legacy pool, in the probe; no other planet does. */
const RELIC_ON_9: SignatureMaterial = {
  planetIndex: 9,
  pool: 'legacy',
  family: 'relic',
  oreTypeId: 'relic_t29',
  hueBand: [155, 168],
  lumaBand: [0.46, 0.68],
}

const SIGNED: SkinGuardContext = { ...CONTEXT, signatureByPlanet: new Map([[9, RELIC_ON_9]]) }

/** A body at hue 162 and luma 0.57, inside the relic look. */
const PATINA = { id: 'patina', ramp: ['#1f5e4a', '#3ebb95', '#9eddca'] }
const SIGNED_LAYERS = { ...LAYERS, palette: [UMBER, PATINA] }

function signatureRow(planet: number, palette = 'patina') {
  return { planet, base: 'granular', vein: 'brass-thread', palette, sheen: 'dull' }
}

function signedFileOf(skins: readonly object[], signatures: unknown, layers = SIGNED_LAYERS) {
  return { layers, skins, signatures }
}

describe('mineral skins table signature rows', () => {
  it('loads a skin for a planet whose signature its pool covers', () => {
    const file = signedFileOf([skinRow('ironstone-brassvein')], [signatureRow(9)])
    expect(loadSkinTable(file, SIGNED).signatures).toEqual([signatureRow(9)])
  })

  it('reads a file with no signatures list as none', () => {
    expect(loadSkinTable(fileOf([]), SIGNED).signatures).toEqual([])
    expect(skinTableProblems(signedFileOf([], {}), SIGNED)).toEqual([
      'signatures must be a list when given',
    ])
  })

  it('refuses a planet that paints no pooled signature', () => {
    expect(skinTableProblems(signedFileOf([], [signatureRow(4)]), SIGNED)).toEqual([
      'a signature skin names planet 4, which paints no pooled signature',
    ])
  })

  it("refuses two skins for one planet's signature", () => {
    const file = signedFileOf([], [signatureRow(9), { ...signatureRow(9), sheen: 'waxy' }])
    expect(skinTableProblems(file, SIGNED)).toEqual([
      'the signature of planet 9 wears two skins; it has one',
    ])
  })

  it('refuses a signature layer id its layer list lacks', () => {
    const file = signedFileOf([], [{ ...signatureRow(9), vein: 'spiral' }])
    expect(skinTableProblems(file, SIGNED)).toEqual([
      'the signature of planet 9 names the vein spiral, which layers.vein lacks',
    ])
  })

  it("refuses a signature sharing all four layers with a species of its planet's pool", () => {
    const species = { ...skinRow('ironstone-brassvein'), palette: 'patina' }
    const file = signedFileOf([species], [signatureRow(9)])
    const context = {
      ...SIGNED,
      hueColourBySpecies: new Map([['ironstone-brassvein', rgbOfHex(PATINA.ramp[1])]]),
    }
    expect(skinTableProblems(file, context)).toEqual([
      'the signature of planet 9 shares base granular, vein brass-thread, palette patina, sheen dull with ironstone-brassvein in pool legacy',
    ])
  })

  it('lets a signature share a combination with a species of another pool', () => {
    const shared = { ...signatureRow(9), palette: 'patina' }
    const file = signedFileOf([{ ...skinRow('far-copper'), palette: 'patina' }], [shared])
    const context = {
      ...SIGNED,
      hueColourBySpecies: new Map([['far-copper', rgbOfHex(PATINA.ramp[1])]]),
    }
    expect(skinTableProblems(file, context)).toEqual([])
  })

  it("refuses a signature palette whose body is outside its family's hue or luma band", () => {
    const green = { id: 'green', ramp: ['#266226', '#4bc34b', '#a5e1a5'] }
    const pale = { id: 'pale', ramp: ['#527067', '#a3e0ce', '#d1f0e6'] }
    const layers = { ...SIGNED_LAYERS, palette: [green, pale] }
    const file = signedFileOf([], [signatureRow(9, 'green')], layers)
    expect(skinTableProblems(file, SIGNED)).toEqual([
      "the signature of planet 9 wears the palette green, whose body is outside its family's hue or luma band",
    ])
    const paleFile = signedFileOf([], [signatureRow(9, 'pale')], layers)
    expect(skinTableProblems(paleFile, SIGNED)).toEqual([
      "the signature of planet 9 wears the palette pale, whose body is outside its family's hue or luma band",
    ])
  })

  it('refuses a planet that is not a whole index from 1, and unknown fields', () => {
    const file = signedFileOf([], [{ ...signatureRow(9), planet: 0.5, species: 'relic' }])
    expect(skinTableProblems(file, SIGNED)).toEqual([
      'signatures[0].planet must be a whole planet index from 1',
      'signatures[0].species is not a field',
    ])
  })
})
