/**
 * The brass gauge cluster (spec #678, ticket 716; G&V 1 and the #500 declutter): the strip's hull,
 * fuel, cargo chain, heat and depth dials as a pure view of the HUD model, laid out from the
 * cluster's data list (`gaugeClusterTable.ts`) the way the tool slot bar lays out its rows. Each
 * dial is a needle on a baked face, never a printed number: the number (through the shared #681
 * formatter, as the readings already carry it) shows only on a hover or a tap of the dial where
 * the layout lets the strip take one, and always in the detail behind the gear (#684's rule). The
 * face turns amber at 25% and red at 10% of what the reading has left (hull and fuel left, cargo
 * and heat room), from the table's zones; the warning ladder's tier (#685) still drives the hatch
 * and the glyph's pulse. The heat dial keeps its slot on a heat planet but draws only above 60%
 * (GD lock), so nothing on the strip moves. The wagons share the cargo chain's one dial with a
 * count badge (HS). The depth dial is depth over R(p) with the planet's band and core marks
 * (`depthDial.ts`). Every value is read fresh from the model, so a change shows on the render
 * that brings it.
 */
import { hudLabelIconIdOf } from '../art/icons/iconSet'
import { uiArtVariableOfPart } from '../art/uiArt'
import { formatAmount } from '../displayAmount'
import { DESIGN_TOKENS, type DesignTokens, type LayoutKind } from './designSystem'
import { depthDialOf, type DepthMarker } from './depthDial'
import {
  GAUGE_CLUSTER,
  type DialReadingKind,
  type DialRow,
  type DialSkin,
  type DialZones,
  type GaugeClusterTable,
  type StripPlace,
} from './gaugeClusterTable'
import type { CargoReading, GaugeReading, HudModel } from './hudModel'
import { depthStripTextOf, isOnSurfaceOf } from './hudStrip'
import { ladderTierOf, type LadderTier } from './warningLadder'

export type DialZone = 'ok' | 'amber' | 'red'

/** The CSS variables a dial's skin draws its baked face and needle through (`--art-*`). */
export interface DialArt {
  face: string | null
  needle: string | null
}

/** One dial as drawn: its needle, zone, revealed number, badge and marks. */
export interface DialFace {
  id: string
  reads: DialReadingKind
  iconId: string
  /** The needle's sweep, 0..1000. */
  needlePermille: number
  /** What the reading has left, 0..1000; the zone and the ladder tier read it. */
  leftPermille: number
  zone: DialZone
  /** The warning ladder's tier (ticket 685), which the hatch and the glyph's pulse follow. */
  tier: LadderTier
  /** The number a hover or a tap reveals. */
  text: string
  exact: string
  /** The cargo chain's link count past the rig's own hold; null with one link. */
  badge: string | null
  /** The depth dial's band and core marks; none on the others. */
  markers: readonly DepthMarker[]
  art: DialArt
  /** The heat at or under 60%: its slot stays and the dial does not draw. */
  isHeld: boolean
}

export interface GaugeClusterView {
  dials: DialFace[]
  /** How many dials the strip had no room for; their numbers are in the detail. */
  overflowCount: number
  /** The brass and glass frame's CSS variable, null for a frame no art token names. */
  frameArt: string | null
}

type FaceReading = Pick<
  DialFace,
  'iconId' | 'needlePermille' | 'leftPermille' | 'text' | 'exact' | 'badge' | 'markers' | 'isHeld'
>

const PERMILLE = 1000
const PERMILLE_PER_PERCENT = 10
const NO_MARKERS: readonly DepthMarker[] = []
const DEPTH_ICON_ID = hudLabelIconIdOf('depth')
/** " / " between a reading's value and its whole. */
const OF_WHOLE_CHARS = 3
/** The depth's " km" or " m" after its digits. */
const DEPTH_UNIT_CHARS = 3

export function gaugeClusterOf(
  model: HudModel,
  kind: LayoutKind,
  table: GaugeClusterTable = GAUGE_CLUSTER,
  tokens: DesignTokens = DESIGN_TOKENS,
): GaugeClusterView {
  const faces = table.dials.flatMap((row) => faceOfRow(row, model, table, tokens))
  const room = table.room[kind][stripPlaceOf(model)]
  return {
    dials: faces.slice(0, room),
    overflowCount: Math.max(0, faces.length - room),
    frameArt: uiArtVariableOfPart(table.frame),
  }
}

/** The surface while the depth is 0 (#684's money side of the strip), a run below it. */
export function stripPlaceOf(model: HudModel): StripPlace {
  return isOnSurfaceOf(model) ? 'surface' : 'run'
}

/** The zone of what a reading has left: red at or under `redAtPercent`, amber at `amberAtPercent`. */
export function dialZoneOf(leftPermille: number, zones: DialZones = GAUGE_CLUSTER.zones): DialZone {
  if (leftPermille <= zones.redAtPercent * PERMILLE_PER_PERCENT) return 'red'
  if (leftPermille <= zones.amberAtPercent * PERMILLE_PER_PERCENT) return 'amber'
  return 'ok'
}

/**
 * The widest number a dial reveals, the width its readout keeps (VS: the worst case never
 * reflows): a value and its whole at the formatter's widest, which also covers the depth.
 */
export function dialNumberCharsMaxOf(tokens: DesignTokens = DESIGN_TOKENS): number {
  const { maxChars } = tokens.numbers
  return Math.max(2 * maxChars + OF_WHOLE_CHARS, maxChars + DEPTH_UNIT_CHARS)
}

/** The count badge on the cargo chain's dial: the links through the formatter, past one. */
export function chainBadgeTextOf(chainLinks: number): string | null {
  return chainLinks > 1 ? formatAmount(chainLinks) : null
}

function faceOfRow(
  row: DialRow,
  model: HudModel,
  table: GaugeClusterTable,
  tokens: DesignTokens,
): DialFace[] {
  const reading = readingOf(row.reads, model, tokens)
  if (reading === null) return []
  return [
    {
      id: row.id,
      reads: row.reads,
      ...reading,
      zone: dialZoneOf(reading.leftPermille, table.zones),
      tier: ladderTierOf(reading.leftPermille, tokens),
      art: dialArtOf(table.skins[row.skin]),
    },
  ]
}

function readingOf(
  reads: DialReadingKind,
  model: HudModel,
  tokens: DesignTokens,
): FaceReading | null {
  switch (reads) {
    case 'hull':
      return leftReadingOf(model.hull)
    case 'fuel':
      return leftReadingOf(model.energy)
    case 'cargo-chain':
      return cargoChainReadingOf(model.cargo)
    case 'heat':
      return model.heat === null ? null : heatReadingOf(model.heat, tokens)
    case 'depth':
      return depthReadingOf(model, tokens)
  }
}

/** A reading whose needle is what it has left: the hull, the fuel. */
function leftReadingOf(gauge: GaugeReading): FaceReading {
  const fill = clampPermille(gauge.permille)
  return { ...plainFaceOf(gauge, fill), leftPermille: fill }
}

/** GD lock: the heat shows only above 60% of its gauge; under it the slot stays and is empty. */
function heatReadingOf(heat: GaugeReading, tokens: DesignTokens): FaceReading {
  const fill = clampPermille(heat.permille)
  const showsAbove = tokens.layout.strip.heatShowsAbovePercent * PERMILLE_PER_PERCENT
  return { ...plainFaceOf(heat, fill), leftPermille: PERMILLE - fill, isHeld: fill <= showsAbove }
}

function cargoChainReadingOf(cargo: CargoReading): FaceReading {
  const fill = clampPermille(cargo.permille)
  return {
    ...plainFaceOf(cargo, fill),
    leftPermille: PERMILLE - fill,
    badge: chainBadgeTextOf(cargo.chainLinks),
  }
}

/** Depth over R(p), nothing to run out of, so it stays out of the zones. */
function depthReadingOf(model: HudModel, tokens: DesignTokens): FaceReading {
  const { depthTiles, scale } = model.depth
  const dial = depthDialOf(depthTiles, scale)
  return {
    iconId: DEPTH_ICON_ID,
    needlePermille: dial.needlePermille,
    leftPermille: PERMILLE,
    text: depthStripTextOf(depthTiles, tokens),
    exact: String(depthTiles),
    badge: null,
    markers: dial.markers,
    isHeld: false,
  }
}

function plainFaceOf(gauge: GaugeReading, fill: number): Omit<FaceReading, 'leftPermille'> {
  return {
    iconId: gauge.iconId,
    needlePermille: fill,
    text: gauge.text,
    exact: gauge.exact,
    badge: null,
    markers: NO_MARKERS,
    isHeld: false,
  }
}

function dialArtOf(skin: DialSkin | undefined): DialArt {
  if (skin === undefined) return { face: null, needle: null }
  return { face: uiArtVariableOfPart(skin.dial), needle: uiArtVariableOfPart(skin.needle) }
}

function clampPermille(permille: number): number {
  return Math.max(0, Math.min(PERMILLE, permille))
}
