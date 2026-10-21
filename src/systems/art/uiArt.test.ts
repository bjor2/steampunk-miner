import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { blenderAssetIds, categoryOfAssetId, registryPartIds } from './artIds'
import { artCatalogueOf, manifestEntryOf, placeholderSidecarOf } from './artCatalogue'
import type { ManifestEntry } from './assetManifest'
import {
  shippedFilesOf,
  sidecarProblems,
  type PartsSidecar,
  type SidecarPart,
} from './partsSidecar'
import { vehicleSidecar, WHEEL_PART } from './sidecarFixtures'
import {
  uiArtAssetIds,
  uiArtCssVariablesOf,
  uiArtStyleSheetOf,
  uiArtTokenAssetIds,
  uiSpriteFilesOf,
  uiSpriteRuleProblems,
  uiSpritesOf,
  variableNameOf,
} from './uiArt'

// The UI chrome sprites of ticket 683 (design-system.md section 13): the art tokens name them,
// the rules table holds the brief's sizes and insets, and the DOM draws them through CSS variables.

const BAR: SidecarPart = {
  id: 'ui-gauge-bar',
  tier: 1,
  rect: [8, 8, 384, 64],
  sizeM: [96, 16],
  pivotM: [48, 8],
  atM: [0, 0],
  z: 0,
  insetPx: [6, 6],
}

const ACTIVE_TAB: SidecarPart = {
  id: 'ui-frame-tab-active',
  tier: 1,
  rect: [8, 152, 256, 128],
  sizeM: [64, 32],
  pivotM: [32, 16],
  atM: [80, 0],
  z: 0,
  insetPx: [8, 8],
  tintable: true,
}

function uiSidecar(assetId: string, parts: SidecarPart[]): PartsSidecar {
  return {
    assetId,
    schema: 1,
    source: { blend: `art/blender/${assetId}/${assetId}.blend`, sha256: 'abc', blender: '4.2.9' },
    pxPerMetre: 4,
    atlasPx: [512, 512],
    maps: { albedo: `${assetId}.albedo.ktx2`, normal: `${assetId}.normal.ktx2`, emissive: false },
    parts,
  }
}

function finalEntry(id: string, status: ManifestEntry['status'] = 'final'): ManifestEntry {
  return { id, source: 'blender', form: 'parts', status, color: '#c9a24b' }
}

describe('ui art ids', () => {
  it('names a ui Blender asset for every art token, with a placeholder sidecar and a manifest entry', () => {
    const assetIds = Object.values(uiArtTokenAssetIds())
    expect(assetIds.length).toBeGreaterThan(0)
    for (const assetId of assetIds) {
      expect(categoryOfAssetId(assetId)).toBe('ui')
      expect(blenderAssetIds()).toContain(assetId)
      expect(manifestEntryOf(SHIPPED_ART, assetId)).not.toBeNull()
      expect(placeholderSidecarOf(SHIPPED_ART, assetId)).not.toBeNull()
    }
  })

  it('keeps the sprite rules table and the tokens in step, every part named under its asset', () => {
    expect(uiSpriteRuleProblems()).toEqual([])
    expect(uiArtAssetIds()).toEqual([...uiArtAssetIds()].sort())
    for (const partId of uiArtAssetIds().flatMap((id) => uiSpritesOf(id).map((s) => s.partId))) {
      expect(registryPartIds()).toContain(partId)
    }
  })

  it('writes every placeholder at the brief’s 1x size and insets, one unit per CSS px', () => {
    for (const assetId of uiArtAssetIds()) {
      const placeholder = placeholderSidecarOf(SHIPPED_ART, assetId)
      const sprites = uiSpritesOf(assetId)
      expect(placeholder?.pxPerMetre).toBe(4)
      expect(placeholder?.parts.map((part) => part.id).sort()).toEqual(
        sprites.map((sprite) => sprite.partId).sort(),
      )
      for (const sprite of sprites) {
        const part = placeholder?.parts.find((candidate) => candidate.id === sprite.partId)
        expect(part?.sizeM).toEqual(sprite.sizePx)
        expect(part?.insetPx ?? null).toEqual(sprite.insetPx)
      }
    }
  })

  it('keeps every stroke readable at 360 px: no inset reaches half the sprite', () => {
    for (const sprite of uiArtAssetIds().flatMap(uiSpritesOf)) {
      if (sprite.insetPx === null) continue
      expect(2 * sprite.insetPx[0]).toBeLessThan(sprite.sizePx[0])
      expect(2 * sprite.insetPx[1]).toBeLessThan(sprite.sizePx[1])
    }
  })
})

describe('ui sprite sidecars', () => {
  it('accepts insets inside the sprite and a tint flag, and ships a PNG pair per sprite and mask', () => {
    const sidecar = uiSidecar('ui-frame-tab', [{ ...ACTIVE_TAB, id: 'ui-frame-tab' }, ACTIVE_TAB])
    expect(sidecarProblems('ui-frame-tab', sidecar)).toEqual([])
    expect(uiSpriteFilesOf(sidecar)).toEqual([
      'ui-frame-tab.png',
      'ui-frame-tab@2x.png',
      'ui-frame-tab.tint.png',
      'ui-frame-tab.tint@2x.png',
      'ui-frame-tab-active.png',
      'ui-frame-tab-active@2x.png',
      'ui-frame-tab-active.tint.png',
      'ui-frame-tab-active.tint@2x.png',
    ])
    expect(shippedFilesOf(sidecar)).toEqual([
      'ui-frame-tab.albedo.ktx2',
      'ui-frame-tab.normal.ktx2',
      ...uiSpriteFilesOf(sidecar),
    ])
  })

  it('refuses an inset that reaches half the sprite, since the nine-slice would have no middle', () => {
    const sidecar = uiSidecar('ui-gauge-bar', [{ ...BAR, insetPx: [6, 8] }])
    expect(sidecarProblems('ui-gauge-bar', sidecar)).toEqual([
      'ui-gauge-bar.parts.json: part "ui-gauge-bar" insetPx must be two whole CSS px, each under half the sprite',
    ])
  })

  it('refuses the sprite fields on a world asset, whose parts are metres', () => {
    const wheel = { ...WHEEL_PART, insetPx: [1, 1] as const, tintable: true as const }
    expect(sidecarProblems('vehicle', vehicleSidecar([wheel]))).toEqual([
      'vehicle.parts.json: part "t1-wheel" insetPx belongs to a ui sprite only',
      'vehicle.parts.json: part "t1-wheel" tintable belongs to a ui sprite only',
    ])
    expect(shippedFilesOf(vehicleSidecar())).toEqual([
      'vehicle.albedo.ktx2',
      'vehicle.normal.ktx2',
      'vehicle.emissive.ktx2',
    ])
  })
})

describe('ui art css variables', () => {
  const art = artCatalogueOf(
    [
      finalEntry('ui-gauge-bar'),
      finalEntry('ui-frame-tab'),
      finalEntry('ui-gauge-dial', 'placeholder'),
    ],
    [],
    [
      uiSidecar('ui-gauge-bar', [BAR]),
      uiSidecar('ui-frame-tab', [
        { ...ACTIVE_TAB, id: 'ui-frame-tab', tintable: undefined },
        ACTIVE_TAB,
      ]),
      uiSidecar('ui-gauge-dial', [
        { ...BAR, id: 'ui-gauge-dial', sizeM: [64, 64], insetPx: undefined },
      ]),
    ],
  )

  it('names a variable after the token, with the variant’s suffix', () => {
    expect(variableNameOf('gaugeBar', 'ui-gauge-bar', 'ui-gauge-bar')).toBe('--art-gauge-bar')
    expect(variableNameOf('tabFrame', 'ui-frame-tab', 'ui-frame-tab-active')).toBe(
      '--art-tab-frame-active',
    )
  })

  it('draws a final nine-slice as an image-set of the 1x and 2x files with its slice and width', () => {
    const variables = uiArtCssVariablesOf(art)
    expect(variables['--art-gauge-bar']).toBe(
      'image-set(url("assets/ui/ui-gauge-bar/ui-gauge-bar.png") 1x, url("assets/ui/ui-gauge-bar/ui-gauge-bar@2x.png") 2x)',
    )
    expect(variables['--art-gauge-bar-size']).toBe('96px 16px')
    expect(variables['--art-gauge-bar-slice']).toBe('37.5% 6.25%')
    expect(variables['--art-gauge-bar-width']).toBe('6px 6px')
    expect(variables['--art-gauge-bar-tint']).toBeUndefined()
  })

  it('adds the tint mask only for a tintable part, and the variant under its own suffix', () => {
    const variables = uiArtCssVariablesOf(art)
    expect(variables['--art-tab-frame-tint']).toBeUndefined()
    expect(variables['--art-tab-frame-active-tint']).toBe(
      'image-set(url("assets/ui/ui-frame-tab/ui-frame-tab-active.tint.png") 1x, url("assets/ui/ui-frame-tab/ui-frame-tab-active.tint@2x.png") 2x)',
    )
    expect(variables['--art-tab-frame-active-slice']).toBe('25% 12.5%')
  })

  it('writes nothing for a token whose asset is still a placeholder, so the CSS frame stays', () => {
    const variables = uiArtCssVariablesOf(art)
    expect(Object.keys(variables).filter((name) => name.startsWith('--art-gauge-dial'))).toEqual([])
  })

  it('folds the variables into one root rule', () => {
    const sheet = uiArtStyleSheetOf(art)
    expect(sheet.startsWith(':root{--art-gauge-bar:image-set(')).toBe(true)
    expect(sheet.endsWith(';}')).toBe(true)
    expect(sheet).toContain('--art-tab-frame-active-width:8px 8px;')
  })
})
