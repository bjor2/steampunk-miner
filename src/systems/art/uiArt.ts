/**
 * The UI chrome sprites (ticket 683; docs/ui/design-system.md section 13): the `art.*` design
 * tokens each name a `ui-` Blender asset, baked flat and shipped as PNG for the DOM at 1x and 2x
 * CSS px beside its KTX2 atlas. A UI sprite is authored at one Blender unit per CSS px, so its
 * sidecar `sizeM` is its 1x size and `pxPerMetre.ui` is the bake's supersample. A frame is a
 * nine-slice whose insets (`insetPx`, one value per axis) the sidecar carries, and a part with
 * accent areas (`tintable`) ships an alpha tint mask a planet skin colours in CSS. The sprite table
 * (`uiSprites` in `art/asset-rules.json`) is the brief's size and inset column as data, read by
 * the Blender author script too.
 */
import ASSET_RULES from '../../../art/asset-rules.json'
import { DESIGN_TOKENS } from '../views/designSystem'
import { kebabOfCamel } from './artNaming'
import { exportedSidecarOf, manifestEntryOf, type ArtCatalogue } from './artCatalogue'
import type { Pair, PartsSidecar, SidecarPart } from './partsSidecar'

export const UI_ART_CATEGORY = 'ui'

/** The `public/assets/ui/` folder as the page sees it, like `AtlasMaps` URLs. */
const UI_ASSETS_URL = 'assets/ui/'

const CSS_VARIABLE_PREFIX = '--art-'

interface UiSpriteRule {
  sizePx: readonly number[]
  insetPx?: readonly number[]
}

const UI_SPRITE_RULES: Readonly<Record<string, Readonly<Record<string, UiSpriteRule>>>> =
  ASSET_RULES.uiSprites

/** The PNG scales a UI sprite ships at; 1 is the plain file name, 2 is `@2x`. */
export const UI_PNG_SCALES: readonly number[] = ASSET_RULES.uiPngScales

export interface UiSprite {
  assetId: string
  partId: string
  /** The sprite's size in CSS px at 1x. */
  sizePx: Pair
  /** Nine-slice insets `[x, y]` in CSS px at 1x, or null for a sprite drawn at its own size. */
  insetPx: Pair | null
}

/** The design tokens' `art` block: token name to asset id. */
export function uiArtTokenAssetIds(): Readonly<Record<string, string>> {
  return DESIGN_TOKENS.art
}

/** Every UI sprite asset the tokens name, sorted by code unit like the other id lists. */
export function uiArtAssetIds(): string[] {
  return Object.values(uiArtTokenAssetIds()).sort()
}

/** The sprites an asset bakes, from the rules table; a part id starts with its asset id. */
export function uiSpritesOf(assetId: string): UiSprite[] {
  return Object.entries(UI_SPRITE_RULES[assetId] ?? {}).map(([partId, rule]) => ({
    assetId,
    partId,
    sizePx: pairOf(rule.sizePx),
    insetPx: rule.insetPx === undefined ? null : pairOf(rule.insetPx),
  }))
}

export function uiArtPartIds(): string[] {
  return uiArtAssetIds().flatMap((assetId) => uiSpritesOf(assetId).map((sprite) => sprite.partId))
}

/** The asset a UI part belongs to, or null for a part no art token names. */
export function uiAssetIdOfPart(partId: string): string | null {
  const owners = uiArtAssetIds().filter((assetId) =>
    uiSpritesOf(assetId).some((sprite) => sprite.partId === partId),
  )
  return owners[0] ?? null
}

/**
 * The CSS variable a UI part draws through (`--art-<token><suffix>`), so data that names a part
 * (a gauge skin, ticket 716) reaches its sprite; null for a part no art token names.
 */
export function uiArtVariableOfPart(partId: string): string | null {
  const assetId = uiAssetIdOfPart(partId)
  const token = Object.entries(uiArtTokenAssetIds()).find(([, id]) => id === assetId)?.[0]
  return assetId === null || token === undefined ? null : variableNameOf(token, assetId, partId)
}

/** Why the rules table and the tokens disagree; empty when every token has its sprites and no more. */
export function uiSpriteRuleProblems(): string[] {
  const named = uiArtAssetIds()
  const ruled = Object.keys(UI_SPRITE_RULES)
  return [
    ...named.filter((id) => !ruled.includes(id)).map((id) => `"${id}" has no uiSprites row`),
    ...ruled.filter((id) => !named.includes(id)).map((id) => `"${id}" is not an art token`),
    ...named.flatMap(partPrefixProblems),
  ]
}

function partPrefixProblems(assetId: string): string[] {
  return uiSpritesOf(assetId)
    .filter((sprite) => !sprite.partId.startsWith(assetId))
    .map((sprite) => `part "${sprite.partId}" does not start with "${assetId}"`)
}

/** The PNG files a UI sidecar's parts ship beside the atlas maps, by scale and tint mask. */
export function uiSpriteFilesOf(sidecar: PartsSidecar): string[] {
  return sidecar.parts.flatMap(spriteFileNamesOf)
}

function spriteFileNamesOf(part: SidecarPart): string[] {
  const masks = part.tintable === true ? ['', '.tint'] : ['']
  return masks.flatMap((mask) => UI_PNG_SCALES.map((scale) => spriteFileName(part.id, mask, scale)))
}

function spriteFileName(partId: string, mask: string, scale: number): string {
  return `${partId}${mask}${scale === 1 ? '' : `@${scale}x`}.png`
}

/**
 * The CSS custom properties a style sheet draws the sprites with, for every token whose asset is
 * final and exported: `--art-<token>` (and `--art-<token>-<part suffix>` for a variant) is an
 * `image-set()` of the 1x and 2x files; `-size` the 1x size; on a nine-slice `-slice` the
 * `border-image-slice` percentages and `-width` the `border-image-width`; on a tintable part
 * `-tint` the mask's `image-set()`. A token whose asset is still a placeholder writes nothing, so
 * the CSS frame behind `var()` stays.
 */
export function uiArtCssVariablesOf(art: ArtCatalogue): Record<string, string> {
  return Object.fromEntries(
    Object.entries(uiArtTokenAssetIds()).flatMap(([token, assetId]) =>
      finalPartsOf(art, assetId).flatMap((part) => variablesOfPart(token, assetId, part)),
    ),
  )
}

/** The variables as one `:root` rule, the sheet a composition root mounts. */
export function uiArtStyleSheetOf(art: ArtCatalogue): string {
  const declarations = Object.entries(uiArtCssVariablesOf(art)).map(
    ([name, value]) => `${name}:${value};`,
  )
  return `:root{${declarations.join('')}}`
}

function finalPartsOf(art: ArtCatalogue, assetId: string): readonly SidecarPart[] {
  const entry = manifestEntryOf(art, assetId)
  const sidecar = exportedSidecarOf(art, assetId)
  return entry?.status === 'final' && sidecar !== null ? sidecar.parts : []
}

function variablesOfPart(token: string, assetId: string, part: SidecarPart): [string, string][] {
  const name = variableNameOf(token, assetId, part.id)
  const [width, height] = part.sizeM
  return [
    [name, imageSetOf(assetId, part.id, '')],
    [`${name}-size`, `${width}px ${height}px`],
    ...sliceVariablesOf(name, part),
    ...(part.tintable === true ? [[`${name}-tint`, imageSetOf(assetId, part.id, '.tint')]] : []),
  ] as [string, string][]
}

/** `gaugeBar` is `--art-gauge-bar`; the `ui-frame-tab-active` variant is `--art-frame-tab-active`. */
export function variableNameOf(token: string, assetId: string, partId: string): string {
  const suffix = partId.slice(assetId.length)
  return `${CSS_VARIABLE_PREFIX}${kebabOfCamel(token)}${suffix}`
}

function sliceVariablesOf(name: string, part: SidecarPart): [string, string][] {
  if (part.insetPx === undefined) return []
  const [x, y] = part.insetPx
  const [width, height] = part.sizeM
  return [
    [`${name}-slice`, `${percentOf(y, height)} ${percentOf(x, width)}`],
    [`${name}-width`, `${y}px ${x}px`],
  ]
}

function percentOf(part: number, whole: number): string {
  return `${Number(((part / whole) * 100).toFixed(4))}%`
}

function imageSetOf(assetId: string, partId: string, mask: string): string {
  const files = UI_PNG_SCALES.map(
    (scale) => `url("${UI_ASSETS_URL}${assetId}/${spriteFileName(partId, mask, scale)}") ${scale}x`,
  )
  return `image-set(${files.join(', ')})`
}

function pairOf(values: readonly number[]): Pair {
  return [values[0] ?? 0, values[1] ?? 0]
}
