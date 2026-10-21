/**
 * The design tokens as the CSS custom properties `src/ui/kit/tokens.css` declares (spec #678,
 * ticket 682; docs/ui/design-system.md sections 2-9): one property per token a style sheet can
 * use, the layout-independent ones and the phone values on `:root` (phone first), the desktop
 * values under `data-layout="desktop"` and the sideways phone's slot row under its orientation.
 * `designTokenCss.test.ts` holds the sheet to this list, so the JSON stays the one source. Tokens
 * only rules read (copy, numbers, cues, counts, budgets) stay in `designSystem.ts`. Also a
 * planet's skin as the four skinnable colour properties the shell writes on the root.
 */
import { coloursForPalette, DESIGN_TOKENS, type DesignTokens } from './designSystem'

/** Custom property name to its CSS value, as one rule block declares them. */
export type CssProperties = Record<string, string>

export interface DesignTokenSheet {
  /** Every layout-independent token, plus the phone layout's values (phone first). */
  root: CssProperties
  desktop: CssProperties
  /** A phone held sideways lays its slot cells in one row. */
  phoneLandscape: CssProperties
}

/** The rule each block of the sheet sits under: the root attributes the shell writes. */
export const TOKEN_SHEET_SELECTORS: Record<keyof DesignTokenSheet, string> = {
  root: ':root',
  desktop: ":root[data-layout='desktop']",
  phoneLandscape: ":root[data-layout='phone'][data-orientation='landscape']",
}

export function designTokenSheetOf(tokens: DesignTokens = DESIGN_TOKENS): DesignTokenSheet {
  return {
    root: {
      ...colourPropertiesOf(tokens),
      ...materialPropertiesOf(tokens),
      ...typePropertiesOf(tokens),
      ...spacingPropertiesOf(tokens),
      ...motionPropertiesOf(tokens),
      ...ladderPropertiesOf(tokens),
      ...layoutPropertiesOf(tokens),
      ...safeAreaPropertiesOf(),
      ...layoutKindPropertiesOf(tokens, 'phone', tokens.layout.toolSlots.columns.phonePortrait),
    },
    desktop: layoutKindPropertiesOf(tokens, 'desktop', tokens.layout.toolSlots.columns.desktop),
    phoneLandscape: { '--slot-columns': String(tokens.layout.toolSlots.columns.phoneLandscape) },
  }
}

/**
 * The skinnable colours for the planet's palette (section 14): its skin over the base, every
 * skinnable token written so leaving a skinned planet puts the base colours back.
 */
export function planetSkinStyleOf(
  paletteId: string,
  tokens: DesignTokens = DESIGN_TOKENS,
): CssProperties {
  const colours: Record<string, string> = coloursForPalette(paletteId, tokens)
  return Object.fromEntries(
    tokens.skinnable.map((name) => [colourPropertyOf(name), colours[name]] as const),
  )
}

/** `accentSoft` to `--color-accent-soft`. */
export function colourPropertyOf(name: string): string {
  return `--color-${kebabOf(name)}`
}

function colourPropertiesOf(tokens: DesignTokens): CssProperties {
  const colours = Object.entries(tokens.colour).map(([name, hex]) => [colourPropertyOf(name), hex])
  const fills = Object.entries(tokens.gaugeFills).map(([gauge, colour]) => [
    `--gauge-fill-${gauge}`,
    `var(${colourPropertyOf(colour)})`,
  ])
  return {
    ...Object.fromEntries([...colours, ...fills]),
    // Section 2: a panel is the panel colour at the panel opacity, so the world shows through.
    '--color-panel': rgbWithAlphaOf(tokens.colour.panel, tokens.panelOpacity),
    '--glass-sheen-opacity': String(tokens.glassSheenOpacity),
  }
}

function materialPropertiesOf(tokens: DesignTokens): CssProperties {
  return Object.fromEntries(
    Object.entries(tokens.materials).flatMap(([material, stops]) =>
      Object.entries(stops).map(([stop, hex]) => [`--material-${material}-${stop}`, hex]),
    ),
  )
}

/** Sizes as rem, so they grow with `--ui-scale` (#173) through the root font size. */
function typePropertiesOf(tokens: DesignTokens): CssProperties {
  const { type } = tokens
  const sizes = Object.entries(type.sizesPx).map(([role, px]) => [`--type-${role}`, remOf(px)])
  return {
    '--font-body': type.fontBody,
    '--font-numerals': type.fontNumerals,
    '--type-min': remOf(type.minPx),
    ...Object.fromEntries(sizes),
    '--line-height': String(type.lineHeight),
    '--label-tracking': `${type.labelTrackingEm}em`,
  }
}

function spacingPropertiesOf(tokens: DesignTokens): CssProperties {
  const spaces = Object.entries(tokens.spacePx).map(([step, px]) => [
    `--space-${step}`,
    `calc(${px}px * var(--ui-scale))`,
  ])
  const radii = Object.entries(tokens.radiusPx).map(([name, px]) => [`--radius-${name}`, `${px}px`])
  const frames = Object.entries(tokens.framePx).map(([name, px]) => [`--frame-${name}`, `${px}px`])
  return Object.fromEntries([...spaces, ...radii, ...frames])
}

function motionPropertiesOf(tokens: DesignTokens): CssProperties {
  const { motion } = tokens
  const durations = Object.entries(motion.durationsMs).map(([name, ms]) => [
    `--motion-${name}`,
    `${ms}ms`,
  ])
  const easings = Object.entries(motion.easing).map(([name, curve]) => [`--ease-${name}`, curve])
  return {
    '--motion-max': `${motion.transitionMaxMs}ms`,
    ...Object.fromEntries([...durations, ...easings]),
    '--needle-ease-min': `${motion.needle.easeMinMs}ms`,
    '--needle-ease-max': `${motion.needle.easeMaxMs}ms`,
    '--needle-lag-max': `${motion.needle.lagMaxMs}ms`,
    '--needle-overshoot': String(motion.needle.overshootShare),
    '--odometer-roll-max': `${motion.odometer.rollMaxMs}ms`,
    '--odometer-digit': `${motion.odometer.digitMs}ms`,
    '--float-up': `${motion.floatUpMs}ms`,
    '--glow-pulse': `${motion.glowPulseMs}ms`,
    '--toast-max': `${motion.toastMaxMs}ms`,
  }
}

function ladderPropertiesOf(tokens: DesignTokens): CssProperties {
  const { warningLadder } = tokens
  const tiers = warningLadder.tiers.map((tier) => [
    `--warn-${tier.name}`,
    `var(${colourPropertyOf(tier.colour)})`,
  ])
  return {
    ...Object.fromEntries(tiers),
    '--warn-glow-opacity': String(warningLadder.glow.opacity),
  }
}

/** The layout's shares are of the stage, so a box placed with them lands where the budget says. */
function layoutPropertiesOf(tokens: DesignTokens): CssProperties {
  const { layout } = tokens
  return {
    '--tap-target-min': `${layout.tapTargetMinPx}px`,
    '--coarse-target': `${layout.coarseTargetPx}px`,
    '--top-keep-out': `${layout.topKeepOutPercent}%`,
    '--thumb-zone-height': `${layout.thumbZoneHeightPercent}%`,
    '--stick-zone-width': `${layout.stickZoneWidthPercent}%`,
    '--middle-band-top': `${layout.middleBand.topPercent}%`,
    '--middle-band-bottom': `${layout.middleBand.bottomPercent}%`,
    '--edge-lane': `${layout.edgeLanePx}px`,
    '--layout-margin': `${layout.marginPx}px`,
    '--strip-bar-height': `${layout.strip.barHeightPx}px`,
    '--edge-gauge-width': `${layout.edgeGauge.widthPx}px`,
    '--slot-gauge-length': `${layout.edgeGauge.slotLengthPx}px`,
    '--status-icon-size': `${layout.statusIcons.sizePx}px`,
    '--slot-gap': `${layout.toolSlots.gapPx}px`,
    '--slot-cooldown-ring': `${layout.toolSlots.cooldownRingPx}px`,
    '--sheet-dock-width': `${layout.sheetDock.widthPx}px`,
  }
}

/**
 * Where a HUD box's outer edge sits (section 9, `hudBudgetBoxesOf`): the strip right under the
 * top safe inset, every other side a margin past its inset. Insets push boxes in, never shrink
 * them. The `--safe-*` mirrors are the shell's (ticket 483).
 */
function safeAreaPropertiesOf(): CssProperties {
  return {
    '--hud-inset-top': 'var(--safe-top)',
    '--hud-inset-right': 'calc(var(--safe-right) + var(--layout-margin))',
    '--hud-inset-bottom': 'calc(var(--safe-bottom) + var(--layout-margin))',
    '--hud-inset-left': 'calc(var(--safe-left) + var(--layout-margin))',
  }
}

function layoutKindPropertiesOf(
  tokens: DesignTokens,
  kind: 'phone' | 'desktop',
  slotColumns: number,
): CssProperties {
  const { layout, warningLadder } = tokens
  return {
    '--strip-height': `${layout.strip.heightPx[kind]}px`,
    '--strip-max-width': `${layout.strip.maxWidthPx[kind]}px`,
    '--slot-cell': `${layout.toolSlots.cellPx[kind]}px`,
    '--slot-columns': String(slotColumns),
    '--warn-glow-thickness': `${warningLadder.glow.thicknessPx[kind]}px`,
  }
}

const ROOT_FONT_PX = 16

function remOf(px: number): string {
  return `${px / ROOT_FONT_PX}rem`
}

function kebabOf(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

const HEX_CHANNEL_STARTS = [1, 3, 5] as const

/** `#1b1613` at 0.85 to `rgb(27 22 19 / 0.85)`, the form the sheet has always written. */
function rgbWithAlphaOf(hex: string, alpha: number): string {
  const channels = HEX_CHANNEL_STARTS.map((start) => parseInt(hex.slice(start, start + 2), 16))
  return `rgb(${channels.join(' ')} / ${alpha})`
}
