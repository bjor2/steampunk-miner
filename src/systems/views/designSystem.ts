/**
 * The UI design system's tokens (spec #678, ticket 679; docs/ui/design-system.md): colour,
 * materials, type, spacing, motion, the warning ladder, the UI sound cues, the HUD layout limits
 * and the copy and number budgets, read once from `designTokens.json` and refused whole when
 * broken, so a bad edit fails at load with every problem listed. A planet re-skins the UI by
 * naming only the `skinnable` colours under its palette id; every limit stays the same on every
 * planet. Presentation only: nothing here reaches a rule, a price or a digest.
 */
import tokensFile from '../../data/design/designTokens.json'
import { isHexColour } from '../render/colour'
import type { HudDensity } from './screenLayout'

export type DesignTokens = typeof tokensFile
export type ColourName = keyof DesignTokens['colour']
export type MaterialName = keyof DesignTokens['materials']
export type LayoutKind = 'phone' | 'desktop'
/** A planet's UI re-skin: only the `skinnable` colours, each a hex colour. */
export type PlanetSkin = Partial<Record<ColourName, string>>

export const DESIGN_TOKENS: DesignTokens = tokensFile

/** The UI's own cue ids all start with this; a slice's cues keep the slice prefix. */
const UI_CUE_PREFIX = 'ui.'
const PERCENT_MAX = 100

/** The breakpoint is the HUD density switch (GD ruling 5 on #500): one source, no second rule. */
export function layoutKindOf(density: HudDensity): LayoutKind {
  return density === 'compact' ? 'phone' : 'desktop'
}

/** The base colours with the planet's skin laid over them; an unknown palette is the base. */
export function coloursForPalette(
  paletteId: string,
  tokens: DesignTokens = DESIGN_TOKENS,
): DesignTokens['colour'] {
  const skins: Record<string, PlanetSkin> = tokens.planetSkins
  return { ...tokens.colour, ...(skins[paletteId] ?? {}) }
}

/** Why a planet skin cannot be applied: a token that is not skinnable, or not a hex colour. */
export function skinProblemsOf(skin: PlanetSkin, tokens: DesignTokens = DESIGN_TOKENS): string[] {
  const skinnable: readonly string[] = tokens.skinnable
  return Object.entries(skin).flatMap(([name, value]) => [
    ...(skinnable.includes(name) ? [] : [`"${name}" is not a skinnable token`]),
    ...(isHexColour(value) ? [] : [`"${name}" is not a hex colour`]),
  ])
}

/** Every way the token file breaks its own rules; empty when it is sound. */
export function designTokenProblems(tokens: DesignTokens = DESIGN_TOKENS): string[] {
  return [
    ...colourProblems(tokens),
    ...materialProblems(tokens),
    ...typeProblems(tokens),
    ...motionProblems(tokens),
    ...ladderProblems(tokens),
    ...cueProblems(tokens),
    ...layoutProblems(tokens),
    ...planetSkinProblems(tokens),
  ]
}

function colourProblems(tokens: DesignTokens): string[] {
  const colours = Object.entries(tokens.colour)
    .filter(([, value]) => !isHexColour(value))
    .map(([name]) => `colour.${name} is not a hex colour`)
  const fills = Object.entries(tokens.gaugeFills)
    .filter(([, colour]) => !(colour in tokens.colour))
    .map(([gauge, colour]) => `gaugeFills.${gauge} names no colour "${colour}"`)
  return [...colours, ...fills]
}

function materialProblems(tokens: DesignTokens): string[] {
  return Object.entries(tokens.materials).flatMap(([name, stops]) =>
    Object.entries(stops)
      .filter(([, value]) => !isHexColour(value))
      .map(([stop]) => `materials.${name}.${stop} is not a hex colour`),
  )
}

function typeProblems(tokens: DesignTokens): string[] {
  return Object.entries(tokens.type.sizesPx)
    .filter(([, size]) => size < tokens.type.minPx)
    .map(
      ([role, size]) => `type.sizesPx.${role} (${size}) is under the ${tokens.type.minPx} px floor`,
    )
}

function motionProblems(tokens: DesignTokens): string[] {
  const { motion } = tokens
  const overCap = Object.entries(motion.durationsMs)
    .filter(([, ms]) => ms > motion.transitionMaxMs)
    .map(
      ([name, ms]) =>
        `motion.durationsMs.${name} (${ms}) is over the ${motion.transitionMaxMs} ms cap`,
    )
  return [
    ...overCap,
    ...(motion.needle.easeMinMs <= motion.needle.easeMaxMs
      ? []
      : ['motion.needle easeMinMs is above easeMaxMs']),
    ...(motion.needle.easeMaxMs <= motion.needle.lagMaxMs
      ? []
      : ['motion.needle easeMaxMs is above lagMaxMs: a full ease would leave the needle behind']),
    ...(motion.odometer.digitMs <= motion.odometer.rollMaxMs
      ? []
      : ['motion.odometer digitMs is above rollMaxMs']),
  ]
}

function ladderProblems(tokens: DesignTokens): string[] {
  const { tiers } = tokens.warningLadder
  const descending = tiers.every(
    (tier, index) => index === 0 || tier.atPercent < tiers[index - 1].atPercent,
  )
  const colours = tiers
    .filter((tier) => !(tier.colour in tokens.colour))
    .map((tier) => `warningLadder tier "${tier.name}" names no colour "${tier.colour}"`)
  return [...(descending ? [] : ['warningLadder tiers are not in descending order']), ...colours]
}

function cueProblems(tokens: DesignTokens): string[] {
  const ids = tokens.soundCues.map((cue) => cue.id)
  return tokens.soundCues.flatMap((cue) => [
    ...(cue.id.startsWith(UI_CUE_PREFIX) ? [] : [`sound cue "${cue.id}" is not under "ui."`]),
    ...(Number.isInteger(cue.voices) && cue.voices >= 1
      ? []
      : [`sound cue "${cue.id}" has no whole voice budget`]),
    ...(ids.indexOf(cue.id) === ids.lastIndexOf(cue.id)
      ? []
      : [`sound cue "${cue.id}" is listed twice`]),
  ])
}

function layoutProblems(tokens: DesignTokens): string[] {
  const { layout } = tokens
  const band = layout.middleBand
  const bandSound = band.topPercent < band.bottomPercent && band.bottomPercent <= PERCENT_MAX
  const budgets = Object.entries(layout.coverageMaxPercent)
    .filter(([, percent]) => percent <= 0 || percent > PERCENT_MAX)
    .map(([kind]) => `layout.coverageMaxPercent.${kind} is not a share of the screen`)
  const cells = Object.entries(layout.toolSlots.cellPx)
    .filter(([, px]) => px < layout.tapTargetMinPx)
    .map(([kind]) => `layout.toolSlots.cellPx.${kind} is under the tap target minimum`)
  return [
    ...(bandSound ? [] : ['layout.middleBand is not a band of the screen']),
    ...budgets,
    ...cells,
  ]
}

function planetSkinProblems(tokens: DesignTokens): string[] {
  const skins: Record<string, PlanetSkin> = tokens.planetSkins
  return Object.entries(skins).flatMap(([paletteId, skin]) =>
    skinProblemsOf(skin, tokens).map((problem) => `planetSkins["${paletteId}"]: ${problem}`),
  )
}
